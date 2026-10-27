import 'server-only'
import { and, eq, ne, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { payments, refunds, workerLedgerEntries } from '@/db/schema'
import { businessRule, notFound, pgErrorCode } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { writeAudit, type AuditContext } from '@/modules/audit/audit'
import type { Actor } from '@/modules/auth/types'
import { addOutbox, lockBooking, type BookingRow, type Tx } from '@/modules/bookings/repo'
import { refundPostingsFor } from '@/modules/ledger/postings'

/**
 * Refunds (IMPLEMENTATION_PLAN.md §10.15). The total refunded never exceeds what was paid
 * (checked here and by a database trigger). Each refund posts the professional's ledger
 * entries in the same transaction. Online payments are simulated in this release, so a
 * refund is recorded as processed straight away; cash refunds are settled by Kaamico.
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
        status: 'PROCESSED',
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
  return { refund, keptPaise: left }
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
  return getDb().transaction(async (tx) => {
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
    const { refund, keptPaise } = await issueRefund(tx, {
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
    return { refundId: refund.id, amountPaise: input.amountPaise, keptPaise }
  })
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
