import 'server-only'
import { and, eq, lt, ne, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { bookings, payments, refunds, workerLedgerEntries } from '@/db/schema'
import { AppError, businessRule, notFound, pgErrorCode } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { formatINR } from '@/lib/money'
import { writeAudit, type AuditContext } from '@/modules/audit/audit'
import type { Actor } from '@/modules/auth/types'
import { addOutbox, lockBooking, type BookingRow, type Tx } from '@/modules/bookings/repo'
import { refundPostingsFor } from '@/modules/ledger/postings'
import { createRefund, isDefinitiveRejection } from './razorpay'

/**
 * Refunds (IMPLEMENTATION_PLAN.md §10.15). The total refunded never exceeds what was paid
 * (checked here and by a database trigger). Each refund posts the professional's ledger
 * entries in the same transaction. Simulated and cash refunds are processed at once (cash
 * is settled by Kaamico). A Razorpay refund is recorded as REQUESTED, sent to Razorpay
 * after the transaction commits (`sendProviderRefund`), and confirmed by its webhook; if
 * Razorpay refuses it, it is marked FAILED and its ledger entries are reversed.
 */

type PaymentRow = typeof payments.$inferSelect

export const refundInput = z.object({
  amountPaise: z.number().int().min(100, 'Refund at least ₹1'),
  reason: z.string().trim().min(10, 'Give a reason (at least 10 characters)').max(300),
})

/** Sum of refunds already made (not failed) on a payment. */
export async function refundedSoFar(tx: Tx, paymentId: string): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)::int` })
    .from(refunds)
    .where(and(eq(refunds.paymentId, paymentId), ne(refunds.status, 'FAILED')))
  return row.total
}

/** The booking's captured (possibly partly refunded) payment, locked. */
export async function lockPaidPayment(tx: Tx, bookingId: string): Promise<PaymentRow | null> {
  const [row] = await tx
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, bookingId),
        sql`${payments.status} in ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED')`,
      ),
    )
    .for('update')
  return row ?? null
}

/**
 * Records a refund inside the caller's transaction (the booking and the payment must
 * already be locked). Returns the refund and how much of the payment is still kept.
 */
export async function issueRefund(
  tx: Tx,
  input: {
    admin: Pick<Actor, 'userId'>
    booking: BookingRow
    payment: PaymentRow
    amountPaise: number
    reason: string
    disputeId?: string | null
  },
) {
  const { booking, payment, amountPaise } = input
  const before = await refundedSoFar(tx, payment.id)
  const remaining = payment.amountPaise - before
  if (amountPaise > remaining) {
    throw businessRule(
      'REFUND_TOO_LARGE',
      `At most ${formatINR(remaining)} can still be refunded on this payment`,
      { remainingPaise: remaining },
    )
  }
  let refund
  try {
    ;[refund] = await tx
      .insert(refunds)
      .values({
        paymentId: payment.id,
        amountPaise,
        reason: input.reason,
        status: payment.provider === 'RAZORPAY' ? 'REQUESTED' : 'PROCESSED',
        initiatedByAdminId: input.admin.userId,
        disputeId: input.disputeId ?? null,
      })
      .returning()
  } catch (error) {
    // The trigger is the last guard against concurrent refunds overshooting.
    if (pgErrorCode(error) === 'P0001' || pgErrorCode(error) === '23514') {
      throw businessRule('REFUND_TOO_LARGE', 'Refunds cannot exceed the amount paid')
    }
    throw error
  }
  const left = remaining - amountPaise
  await tx
    .update(payments)
    .set({ status: left === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED', version: payment.version + 1 })
    .where(eq(payments.id, payment.id))
  if (booking.workerId) {
    const describe = {
      REFUND_CLAWBACK: `Refund to customer · ${booking.code}`,
      ADJUSTMENT: `Kaamico fee returned on refund · ${booking.code}`,
    }
    await tx.insert(workerLedgerEntries).values(
      refundPostingsFor({
        grossPaise: payment.amountPaise,
        commissionBps: booking.commissionBps,
        refundPaise: amountPaise,
        refundedBeforePaise: before,
      }).map((p) => ({
        workerId: booking.workerId!,
        bookingId: booking.id,
        type: p.type,
        amountPaise: p.amountPaise,
        description: describe[p.type],
      })),
    )
  }
  await addOutbox(tx, 'payment.refunded', {
    bookingId: booking.id,
    paymentId: payment.id,
    refundId: refund.id,
    amountPaise,
    disputeId: input.disputeId ?? null,
  })
  const provider =
    payment.provider === 'RAZORPAY' && payment.providerPaymentId
      ? { refundId: refund.id, providerPaymentId: payment.providerPaymentId, amountPaise }
      : null
  if (payment.provider === 'RAZORPAY' && !provider) {
    throw businessRule('NOT_REFUNDABLE', 'This online payment has no Razorpay payment to refund')
  }
  return { refund, keptPaise: left, provider }
}

export type ProviderRefund = { refundId: string; providerPaymentId: string; amountPaise: number }

/**
 * Sends a recorded Razorpay refund (call after the recording transaction commits). It is
 * undone only when Razorpay definitely refused it. After a timeout or a server error the
 * outcome is unknown, so it stays REQUESTED and the refund webhook settles it (finding it
 * by the `refundId` note even if we never learned Razorpay's id).
 */
export async function sendProviderRefund(pending: ProviderRefund): Promise<'REQUESTED' | 'FAILED'> {
  let sent
  try {
    sent = await createRefund({
      providerPaymentId: pending.providerPaymentId,
      amountPaise: pending.amountPaise,
      notes: { refundId: pending.refundId },
    })
  } catch (error) {
    if (!isDefinitiveRejection(error)) {
      logger.error(
        { err: error, refundId: pending.refundId },
        'razorpay refund outcome unknown; waiting for the webhook',
      )
      return 'REQUESTED'
    }
    logger.warn({ err: error, refundId: pending.refundId }, 'razorpay refused the refund')
    await getDb().transaction((tx) => failRefund(tx, pending.refundId))
    return 'FAILED'
  }
  try {
    await getDb()
      .update(refunds)
      .set({
        providerRefundId: sent.id,
        ...(sent.status === 'processed' ? { status: 'PROCESSED' as const } : {}),
      })
      .where(and(eq(refunds.id, pending.refundId), eq(refunds.status, 'REQUESTED')))
  } catch (error) {
    // Razorpay has the refund; the webhook will record it.
    logger.error({ err: error, refundId: pending.refundId }, 'could not record razorpay refund id')
  }
  return 'REQUESTED'
}

/**
 * A refund that did not go through: marked FAILED, its ledger entries reversed and the
 * payment's status recalculated. Safe to call twice.
 */
export async function failRefund(tx: Tx, refundId: string): Promise<void> {
  const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for('update')
  if (!refund || refund.status === 'FAILED') return
  const [payment] = await tx
    .select()
    .from(payments)
    .where(eq(payments.id, refund.paymentId))
    .for('update')
  const [booking] = await tx.select().from(bookings).where(eq(bookings.id, payment.bookingId))
  await tx.update(refunds).set({ status: 'FAILED' }).where(eq(refunds.id, refundId))
  if (booking.workerId) {
    // Rebuild the entries exactly as posted: against the refunds made before this one.
    const [earlier] = await tx
      .select({ total: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)::int` })
      .from(refunds)
      .where(
        and(
          eq(refunds.paymentId, payment.id),
          ne(refunds.status, 'FAILED'),
          lt(refunds.createdAt, refund.createdAt),
        ),
      )
    const original = refundPostingsFor({
      grossPaise: payment.amountPaise,
      commissionBps: booking.commissionBps,
      refundPaise: refund.amountPaise,
      refundedBeforePaise: earlier.total,
    })
    await tx.insert(workerLedgerEntries).values(
      original.map((p) => ({
        workerId: booking.workerId!,
        bookingId: booking.id,
        type: 'ADJUSTMENT' as const,
        amountPaise: -p.amountPaise,
        description: `Refund did not go through · ${booking.code}`,
      })),
    )
  }
  const still = await refundedSoFar(tx, payment.id)
  await tx
    .update(payments)
    .set({
      status: still === 0 ? 'CAPTURED' : 'PARTIALLY_REFUNDED',
      version: payment.version + 1,
    })
    .where(eq(payments.id, payment.id))
}

/** An admin refunds part or all of a payment outside a dispute (audited, idempotent route). */
export async function refundPayment(
  admin: Actor,
  paymentId: string,
  raw: unknown,
  context: AuditContext,
) {
  const input = refundInput.parse(raw)
  if (!z.uuid().safeParse(paymentId).success) throw notFound('Payment not found')
  const result = await getDb().transaction(async (tx) => {
    const [ref] = await tx
      .select({ bookingId: payments.bookingId })
      .from(payments)
      .where(eq(payments.id, paymentId))
    if (!ref) throw notFound('Payment not found')
    const booking = await lockBooking(tx, ref.bookingId)
    const payment = await lockPaidPayment(tx, booking.id)
    if (!payment || payment.id !== paymentId) {
      throw businessRule('NOT_REFUNDABLE', 'Only a captured payment can be refunded')
    }
    const { refund, keptPaise, provider } = await issueRefund(tx, {
      admin,
      booking,
      payment,
      amountPaise: input.amountPaise,
      reason: input.reason,
    })
    await writeAudit(tx, admin, context, {
      action: 'PAYMENT_REFUNDED',
      entityType: 'payment',
      entityId: payment.id,
      before: { status: payment.status },
      after: { refundId: refund.id, amountPaise: input.amountPaise, keptPaise },
      reason: input.reason,
    })
    return { refundId: refund.id, amountPaise: input.amountPaise, keptPaise, provider }
  })
  const { refundId, amountPaise, keptPaise } = result
  if (!result.provider) return { refundId, amountPaise, keptPaise, status: 'PROCESSED' as const }
  const status = await sendProviderRefund(result.provider)
  if (status === 'FAILED') {
    throw new AppError(
      'PAYMENT_PROVIDER_ERROR',
      'Razorpay did not accept the refund, so nothing was refunded. Please try again.',
      { status: 502 },
    )
  }
  return { refundId, amountPaise, keptPaise, status }
}

export const adminPaymentQuery = z.object({
  status: z
    .enum(['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'PENDING', 'FAILED'])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  provider: z
    .enum(['CASH', 'SIMULATED', 'RAZORPAY'])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  q: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
})

export type AdminPaymentItem = {
  id: string
  provider: 'CASH' | 'SIMULATED' | 'RAZORPAY'
  status: string
  amountPaise: number
  refundedPaise: number
  capturedAt: string | null
  createdAt: string
  booking: { id: string; code: string; status: string }
  customerName: string | null
  workerName: string | null
}

const PAGE = 25

/** Payments with their refunds, newest first (`q` matches a booking code). */
export async function listAdminPayments(
  raw: unknown,
): Promise<{ items: AdminPaymentItem[]; page: number; hasMore: boolean }> {
  const q = adminPaymentQuery.parse(raw)
  const filters: SQL[] = [sql`p.status <> 'CANCELLED'`]
  if (q.status) filters.push(sql`p.status = ${q.status}`)
  if (q.provider) filters.push(sql`p.provider = ${q.provider}`)
  if (q.q) filters.push(sql`b.code ilike ${`%${q.q.replace(/[\\%_]/g, '')}%`}`)
  const rows = await getDb().execute<{
    id: string
    provider: AdminPaymentItem['provider']
    status: string
    amount_paise: number
    refunded: number
    captured_at: Date | string | null
    created_at: Date | string
    booking_id: string
    code: string
    booking_status: string
    customer_name: string | null
    worker_name: string | null
  }>(sql`
    select p.id, p.provider, p.status, p.amount_paise, p.captured_at, p.created_at,
           coalesce((select sum(r.amount_paise) from refunds r
                     where r.payment_id = p.id and r.status <> 'FAILED'), 0)::int as refunded,
           b.id as booking_id, b.code, b.status as booking_status,
           u.name as customer_name, w.display_name as worker_name
    from payments p
    join bookings b on b.id = p.booking_id
    join users u on u.id = b.customer_id
    left join worker_profiles w on w.id = b.worker_id
    where ${sql.join(filters, sql` and `)}
    order by p.created_at desc, p.id desc
    limit ${PAGE + 1} offset ${(q.page - 1) * PAGE}`)
  return {
    items: rows.slice(0, PAGE).map((r) => ({
      id: r.id,
      provider: r.provider,
      status: r.status,
      amountPaise: r.amount_paise,
      refundedPaise: r.refunded,
      capturedAt: r.captured_at ? new Date(r.captured_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
      booking: { id: r.booking_id, code: r.code, status: r.booking_status },
      customerName: r.customer_name,
      workerName: r.worker_name,
    })),
    page: q.page,
    hasMore: rows.length > PAGE,
  }
}
