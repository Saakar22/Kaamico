import 'server-only'
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getEnv } from '@/config/env'
import { getDb } from '@/db/client'
import { bookingCharges, payments, services, workerLedgerEntries } from '@/db/schema'
import { businessRule, conflict, forbidden, notFound, pgErrorCode } from '@/lib/errors'
import { logger } from '@/lib/logger'
import type { Actor } from '@/modules/auth/types'
import { addOutbox, lockBooking, type BookingRow, type Tx } from '@/modules/bookings/repo'
import { commissionOf, postingsFor, type PaymentMethod } from '@/modules/ledger/postings'
import { createOrder, razorpayConfig, verifyCheckoutSignature } from './razorpay'
import { issueReceipt } from './receipts'

const isUuid = (v: string) => z.uuid().safeParse(v).success
const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null)

export type PaymentView = {
  id: string
  provider: PaymentMethod
  status: string
  amountPaise: number
  failureReason: string | null
  capturedAt: string | null
  /** No money moves: shown with a SIMULATION badge everywhere. */
  simulated: boolean
}

export type PaymentRow = typeof payments.$inferSelect

export const toView = (p: PaymentRow): PaymentView => ({
  id: p.id,
  provider: p.provider,
  status: p.status,
  amountPaise: p.amountPaise,
  failureReason: p.failureReason,
  capturedAt: iso(p.capturedAt),
  simulated: p.provider === 'SIMULATED',
})

const OPEN = ['CREATED', 'PENDING'] as const
/** Paid, even if part or all of it was refunded later: never paid again. */
const PAID = ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const
const isPaid = (status: string) => (PAID as readonly string[]).includes(status)

export const startPaymentInput = z.object({ method: z.enum(['CASH', 'SIMULATED', 'RAZORPAY']) })

/** What the browser needs to open Razorpay Checkout for a payment. */
export type RazorpayCheckout = {
  keyId: string
  orderId: string
  amountPaise: number
  currency: 'INR'
  description: string
}

/** The online method this deployment offers: the simulated checkout or Razorpay test mode. */
export function onlineMethod(): 'SIMULATED' | 'RAZORPAY' {
  return getEnv().PAYMENTS_MODE === 'razorpay' ? 'RAZORPAY' : 'SIMULATED'
}

/**
 * The customer chooses how to pay a completed job (§10.11). The amount always comes from
 * the booking (agreed price + approved extras), never from the client. Cash waits for the
 * professional to confirm receipt; the simulated checkout waits for a simulated outcome;
 * Razorpay gets an order (created after the transaction commits) for its checkout.
 * Choosing again replaces an unfinished attempt.
 */
export async function startPayment(
  actor: Actor,
  bookingId: string,
  raw: unknown,
  idempotencyKey: string,
): Promise<{ payment: PaymentView; checkout?: RazorpayCheckout }> {
  const { method } = startPaymentInput.parse(raw)
  if (!isUuid(bookingId)) throw notFound('Booking not found')
  if (method !== 'CASH' && method !== onlineMethod()) {
    throw businessRule('PAYMENT_METHOD_UNAVAILABLE', 'This way of paying is not available yet')
  }
  const { payment, code } = await openPayment(actor, bookingId, method, idempotencyKey)
  if (method !== 'RAZORPAY') return { payment: toView(payment) }
  return razorpayCheckout(payment, code)
}

/** Creates (or reuses) the Razorpay order for a pending payment; a failure fails the attempt. */
async function razorpayCheckout(
  payment: PaymentRow,
  bookingCode: string,
): Promise<{ payment: PaymentView; checkout: RazorpayCheckout }> {
  const { keyId } = razorpayConfig()
  let orderId = payment.providerOrderId
  let current = payment
  if (!orderId) {
    try {
      const order = await createOrder({
        amountPaise: payment.amountPaise,
        receipt: payment.id,
        notes: { paymentId: payment.id, booking: bookingCode },
      })
      orderId = order.id
    } catch (error) {
      await getDb()
        .update(payments)
        .set({ status: 'FAILED', failureReason: 'Could not start the online payment' })
        .where(and(eq(payments.id, payment.id), eq(payments.status, 'PENDING')))
      throw error
    }
    // Two tabs may race here: the first order saved wins and both checkouts use it.
    const [saved] = await getDb()
      .update(payments)
      .set({ providerOrderId: orderId })
      .where(and(eq(payments.id, payment.id), isNull(payments.providerOrderId)))
      .returning()
    ;[current] = saved
      ? [saved]
      : await getDb().select().from(payments).where(eq(payments.id, payment.id))
    orderId = current.providerOrderId!
  }
  return {
    payment: toView(current),
    checkout: {
      keyId,
      orderId,
      amountPaise: payment.amountPaise,
      currency: 'INR',
      description: `Kaamico booking ${bookingCode}`,
    },
  }
}

async function openPayment(
  actor: Actor,
  bookingId: string,
  method: PaymentMethod,
  idempotencyKey: string,
): Promise<{ payment: PaymentRow; code: string }> {
  return getDb().transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId)
    if (booking.customerId !== actor.userId) throw notFound('Booking not found')
    if (booking.status !== 'COMPLETED' && !owesVisitFee(booking)) {
      throw conflict('NOT_PAYABLE', 'You can pay once the job is marked complete', {
        status: booking.status,
      })
    }
    const existing = await tx
      .select()
      .from(payments)
      .where(eq(payments.bookingId, booking.id))
      .orderBy(desc(payments.createdAt))
    if (existing.some((p) => isPaid(p.status))) {
      throw conflict('ALREADY_PAID', 'This booking is already paid')
    }
    const open = existing.find((p) => (OPEN as readonly string[]).includes(p.status))
    if (open?.provider === method) return { payment: open, code: booking.code }
    if (open) {
      await tx
        .update(payments)
        .set({ status: 'CANCELLED', version: open.version + 1 })
        .where(eq(payments.id, open.id))
    }
    const amount = finalAmount(booking)
    const [created] = await tx
      .insert(payments)
      .values({
        bookingId: booking.id,
        payerUserId: actor.userId,
        provider: method,
        amountPaise: amount,
        status: 'PENDING',
        idempotencyKey,
      })
      .returning()
    if (method === 'CASH') {
      await addOutbox(tx, 'payment.cash_pending', {
        bookingId: booking.id,
        paymentId: created.id,
        amountPaise: amount,
      })
    }
    return { payment: created, code: booking.code }
  })
}

/** A customer who cancelled after the professional set off pays the visit fee (§11.3). */
export const owesVisitFee = (booking: Pick<BookingRow, 'status' | 'visitFeePaise'>) =>
  booking.status === 'CANCELLED' && (booking.visitFeePaise ?? 0) > 0

function finalAmount(booking: BookingRow): number {
  if (owesVisitFee(booking)) return booking.visitFeePaise!
  // `final_amount_paise` is generated by the database; recompute defensively if absent.
  const total =
    booking.finalAmountPaise ?? (booking.agreedPricePaise ?? 0) + booking.approvedChargesPaise
  if (!total || total <= 0) throw conflict('NOT_PAYABLE', 'This booking has no amount to pay')
  return total
}

/** Payment, then its booking locked in the usual order (booking first). */
export async function lockPayment(tx: Tx, paymentId: string) {
  if (!isUuid(paymentId)) throw notFound('Payment not found')
  const [ref] = await tx
    .select({ bookingId: payments.bookingId })
    .from(payments)
    .where(eq(payments.id, paymentId))
  if (!ref) throw notFound('Payment not found')
  const booking = await lockBooking(tx, ref.bookingId)
  const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for('update')
  return { booking, payment }
}

export const simulateInput = z.object({ outcome: z.enum(['success', 'failure']) })

/** The simulated checkout's result. Only exists while payments run in simulated mode. */
export async function simulatePayment(
  actor: Actor,
  paymentId: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<{ payment: PaymentView }> {
  if (getEnv().PAYMENTS_MODE !== 'simulated') throw notFound('Payment not found')
  const { outcome } = simulateInput.parse(raw)
  return getDb().transaction(async (tx) => {
    const { booking, payment } = await lockPayment(tx, paymentId)
    if (booking.customerId !== actor.userId || payment.provider !== 'SIMULATED') {
      throw notFound('Payment not found')
    }
    if (payment.status !== 'PENDING') {
      throw conflict('PAYMENT_NOT_PENDING', 'This payment has already finished', {
        status: payment.status,
      })
    }
    if (outcome === 'failure') {
      const [failed] = await tx
        .update(payments)
        .set({
          status: 'FAILED',
          failureReason: 'Simulated failure: the bank declined the payment',
          version: payment.version + 1,
        })
        .where(eq(payments.id, payment.id))
        .returning()
      return { payment: toView(failed) }
    }
    return { payment: toView(await capture(tx, booking, payment, now)) }
  })
}

/** The professional confirms they received the cash; this captures the payment. */
export async function confirmCash(
  actor: Actor,
  paymentId: string,
  now: Date = new Date(),
): Promise<{ payment: PaymentView }> {
  return getDb().transaction(async (tx) => {
    const { booking, payment } = await lockPayment(tx, paymentId)
    if (!actor.workerId || booking.workerId !== actor.workerId) throw notFound('Payment not found')
    if (payment.provider !== 'CASH') throw forbidden('Only cash payments are confirmed by hand')
    if (payment.status !== 'PENDING') {
      throw conflict('PAYMENT_NOT_PENDING', 'This payment has already finished', {
        status: payment.status,
      })
    }
    return { payment: toView(await capture(tx, booking, payment, now)) }
  })
}

export const razorpayConfirmInput = z.object({
  razorpay_order_id: z.string().min(1).max(80),
  razorpay_payment_id: z.string().min(1).max(80),
  razorpay_signature: z.string().min(1).max(200),
})

/**
 * Razorpay Checkout's success callback. The signature (HMAC of order and payment id with
 * our key secret) proves Razorpay approved this payment for this order, so it is captured
 * now; the `payment.captured` webhook confirms it too, and whichever comes second is a
 * no-op. Requires automatic capture to be on in the Razorpay dashboard.
 */
export async function confirmRazorpay(
  actor: Actor,
  paymentId: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<{ payment: PaymentView }> {
  const input = razorpayConfirmInput.parse(raw)
  const { keySecret } = razorpayConfig()
  return getDb().transaction(async (tx) => {
    const { booking, payment } = await lockPayment(tx, paymentId)
    if (booking.customerId !== actor.userId || payment.provider !== 'RAZORPAY') {
      throw notFound('Payment not found')
    }
    const genuine =
      payment.providerOrderId === input.razorpay_order_id &&
      verifyCheckoutSignature(
        {
          orderId: input.razorpay_order_id,
          paymentId: input.razorpay_payment_id,
          signature: input.razorpay_signature,
        },
        keySecret,
      )
    if (!genuine)
      throw businessRule('PAYMENT_SIGNATURE_INVALID', 'We could not verify this payment')
    if (isPaid(payment.status)) return { payment: toView(payment) }
    await captureOrFlag(tx, booking, payment, input.razorpay_payment_id, now)
    const [after] = await tx.select().from(payments).where(eq(payments.id, payment.id))
    return { payment: toView(after) }
  })
}

/**
 * Records money Razorpay has taken for `payment` (from the checkout callback or the
 * webhook). Normally that captures it. If the booking was meanwhile paid another way, it
 * cannot count twice: the payment is flagged for a refund and logged for a person to act
 * on, instead of failing (a failing webhook would be retried forever). Returns whether
 * anything changed.
 */
export async function captureOrFlag(
  tx: Tx,
  booking: BookingRow,
  payment: PaymentRow,
  providerPaymentId: string,
  now: Date,
): Promise<boolean> {
  const [other] = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, booking.id),
        inArray(payments.status, [...PAID]),
        ne(payments.id, payment.id),
      ),
    )
  if (!other) {
    await capture(tx, booking, payment, now, providerPaymentId)
    return true
  }
  if (payment.providerPaymentId === providerPaymentId) return false
  logger.error(
    { bookingId: booking.id, paymentId: payment.id, providerPaymentId },
    'razorpay took a second payment for an already-paid booking: refund it in Razorpay',
  )
  await tx
    .update(payments)
    .set({
      providerPaymentId,
      failureReason: 'Paid twice: refund this Razorpay payment',
      version: payment.version + 1,
    })
    .where(eq(payments.id, payment.id))
  return true
}

/**
 * Marks the payment captured and, in the same transaction, posts the professional's
 * ledger entries (§11.4) and issues the receipt. Unique indexes make a second capture
 * or a double posting impossible even if this ran twice.
 */
export async function capture(
  tx: Tx,
  booking: BookingRow,
  payment: PaymentRow,
  now: Date,
  providerPaymentId?: string,
) {
  let captured: PaymentRow
  try {
    ;[captured] = await tx
      .update(payments)
      .set({
        status: 'CAPTURED',
        capturedAt: now,
        failureReason: null,
        version: payment.version + 1,
        ...(providerPaymentId ? { providerPaymentId } : {}),
      })
      .where(eq(payments.id, payment.id))
      .returning()
  } catch (error) {
    if (pgErrorCode(error) === '23505')
      throw conflict('ALREADY_PAID', 'This booking is already paid')
    throw error
  }
  // Any other unfinished attempt (e.g. cash still awaiting confirmation) is now moot.
  await tx
    .update(payments)
    .set({ status: 'CANCELLED' })
    .where(
      and(
        eq(payments.bookingId, booking.id),
        inArray(payments.status, [...OPEN]),
        ne(payments.id, payment.id),
      ),
    )
  const gross = payment.amountPaise
  const [service] = await tx
    .select({ name: services.name })
    .from(services)
    .where(eq(services.id, booking.serviceId))
  const visitFee = owesVisitFee(booking)
  const describe: Record<string, string> = {
    JOB_EARNING: `${visitFee ? 'Visit fee: ' : ''}${service.name} · ${booking.code}`,
    COMMISSION: `Kaamico fee ${booking.commissionBps / 100}% · ${booking.code}`,
    CASH_COLLECTED: `Paid to you in cash · ${booking.code}`,
  }
  await tx.insert(workerLedgerEntries).values(
    postingsFor({
      grossPaise: gross,
      commissionBps: booking.commissionBps,
      method: payment.provider,
    }).map((p) => ({
      workerId: booking.workerId!,
      bookingId: booking.id,
      type: p.type,
      amountPaise: p.amountPaise,
      description: describe[p.type],
    })),
  )
  const approved = visitFee
    ? []
    : await tx
        .select({
          description: bookingCharges.description,
          amountPaise: bookingCharges.amountPaise,
        })
        .from(bookingCharges)
        .where(and(eq(bookingCharges.bookingId, booking.id), eq(bookingCharges.status, 'APPROVED')))
  await issueReceipt(tx, {
    bookingId: booking.id,
    lineItems: visitFee
      ? [{ label: `${service.name}: visit fee (cancelled after set-off)`, amountPaise: gross }]
      : [
          {
            label: `${service.name} (agreed price)`,
            amountPaise: booking.agreedPricePaise ?? gross,
          },
          ...approved.map((c) => ({
            label: `Extra: ${c.description}`,
            amountPaise: c.amountPaise,
          })),
        ],
    totalPaise: gross,
    platformFeePaise: commissionOf(gross, booking.commissionBps),
    now,
  })
  await addOutbox(tx, 'payment.captured', {
    bookingId: booking.id,
    paymentId: payment.id,
    provider: payment.provider,
    amountPaise: gross,
  })
  return captured
}

export type BookingPayment = {
  /** UNPAID until a payment is captured; AWAITING_* while one is in progress. */
  state: 'UNPAID' | 'AWAITING_CASH' | 'AWAITING_SIMULATED' | 'AWAITING_ONLINE' | 'PAID'
  payment: PaymentView | null
  /** The last failed attempt, if it is the most recent one. */
  lastFailure: string | null
  receiptNumber: string | null
}

/** Payment state for a booking page (both sides). */
export async function bookingPayment(bookingId: string): Promise<BookingPayment> {
  const db = getDb()
  const [rows, [receipt]] = await Promise.all([
    db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.bookingId, bookingId),
          inArray(payments.status, ['PENDING', 'CREATED', 'FAILED', ...PAID]),
        ),
      )
      .orderBy(desc(payments.createdAt)),
    db.execute<{ number: string }>(
      sql`select number from invoices where booking_id = ${bookingId}`,
    ),
  ])
  const captured = rows.find((p) => isPaid(p.status))
  const open = rows.find((p) => p.status === 'PENDING' || p.status === 'CREATED')
  const latest = rows[0]
  const current = captured ?? open ?? null
  return {
    state: captured
      ? 'PAID'
      : open?.provider === 'CASH'
        ? 'AWAITING_CASH'
        : open
          ? open.provider === 'RAZORPAY'
            ? 'AWAITING_ONLINE'
            : 'AWAITING_SIMULATED'
          : 'UNPAID',
    payment: current ? toView(current) : null,
    lastFailure: !captured && !open && latest?.status === 'FAILED' ? latest.failureReason : null,
    receiptNumber: receipt?.number ?? null,
  }
}
