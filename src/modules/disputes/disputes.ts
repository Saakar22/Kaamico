import 'server-only'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { bookings, disputeEvidence, disputes, payments } from '@/db/schema'
import { businessRule, conflict, notFound, pgErrorCode } from '@/lib/errors'
import { enforceRateLimit } from '@/lib/rate-limit'
import { writeAudit, type AuditContext } from '@/modules/audit/audit'
import type { Actor } from '@/modules/auth/types'
import {
  addOutbox,
  appendHistory,
  lockBooking,
  type BookingRow,
  type Tx,
} from '@/modules/bookings/repo'
import { canTransition, type BookingStatus } from '@/modules/bookings/state-machine'
import { issueRefund, lockPaidPayment, refundedSoFar } from '@/modules/payments/refunds'
import { DISPUTE_REASONS, type DisputeReason } from './labels'

/**
 * "Report a problem" (IMPLEMENTATION_PLAN.md §10.14, §11.3). Either party can report a
 * problem with a job in progress (safety only) or up to 72 hours after it is completed.
 * The booking moves to DISPUTED until an admin resolves it, optionally with a refund.
 */

export const DISPUTE_WINDOW_HOURS = 72
const HOUR = 3_600_000
const OPEN_STATUSES = ['OPEN', 'UNDER_REVIEW'] as const
const isUuid = (v: string) => z.uuid().safeParse(v).success
const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null)

export const raiseInput = z.object({
  reason: z.enum(DISPUTE_REASONS),
  description: z
    .string()
    .trim()
    .min(20, 'Tell us what happened (at least 20 characters)')
    .max(2000),
})

export const evidenceInput = z.object({
  note: z.string().trim().min(2, 'Write a short note').max(1000),
})

type Side = 'CUSTOMER' | 'WORKER'

function sideOf(actor: Actor, booking: Pick<BookingRow, 'customerId' | 'workerId'>): Side | null {
  if (booking.customerId === actor.userId) return 'CUSTOMER'
  if (actor.workerId && booking.workerId === actor.workerId) return 'WORKER'
  return null
}

/** Whether `side` may report a problem with this booking now (mirrors `raiseDispute`). */
export function canReport(
  booking: { status: string; completedAt: Date | string | null },
  now: Date = new Date(),
): { allowed: boolean; safetyOnly: boolean } {
  if (booking.status === 'IN_PROGRESS') return { allowed: true, safetyOnly: true }
  if (booking.status === 'COMPLETED' && booking.completedAt) {
    const closes = new Date(booking.completedAt).getTime() + DISPUTE_WINDOW_HOURS * HOUR
    return { allowed: now.getTime() <= closes, safetyOnly: false }
  }
  return { allowed: false, safetyOnly: false }
}

/** Moves a locked booking to `to`, with history; the caller has checked the rule. */
async function moveBooking(
  tx: Tx,
  booking: BookingRow,
  to: BookingStatus,
  actor: { userId: string; role: 'CUSTOMER' | 'WORKER' | 'ADMIN' },
  reason: string,
  now: Date,
) {
  const set: Partial<typeof bookings.$inferInsert> = { status: to, version: booking.version + 1 }
  if (to === 'COMPLETED') set.completedAt = booking.completedAt ?? now
  if (to === 'CANCELLED') {
    Object.assign(set, { cancelledAt: now, cancelledBy: 'ADMIN', cancellationReason: reason })
  }
  try {
    await tx.update(bookings).set(set).where(eq(bookings.id, booking.id))
  } catch (error) {
    // Back to IN_PROGRESS: the professional's time may have been booked meanwhile.
    if (pgErrorCode(error) === '23P01') {
      throw conflict('SLOT_TAKEN', 'The professional has another job at that time now')
    }
    throw error
  }
  await appendHistory(tx, {
    bookingId: booking.id,
    from: booking.status as BookingStatus,
    to,
    actorUserId: actor.userId,
    actorRole: actor.role,
    reason,
  })
}

/** The customer or the assigned professional reports a problem (idempotent route). */
export async function raiseDispute(
  actor: Actor,
  bookingId: string,
  raw: unknown,
  now: Date = new Date(),
) {
  const input = raiseInput.parse(raw)
  if (!isUuid(bookingId)) throw notFound('Booking not found')
  await enforceRateLimit(
    `disputes:user:${actor.userId}`,
    { limit: 5, windowSeconds: 24 * 3600 },
    'Too many reports today. Please contact support.',
  )
  return getDb().transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId)
    const side = sideOf(actor, booking)
    if (!side) throw notFound('Booking not found')
    const window = canReport(booking, now)
    if (!window.allowed || !canTransition(booking.status as BookingStatus, 'DISPUTED', side)) {
      throw businessRule(
        'NOT_DISPUTABLE',
        booking.status === 'DISPUTED'
          ? 'A problem with this booking is already being looked at'
          : `Problems can be reported during the job (safety) or up to ${DISPUTE_WINDOW_HOURS} hours after it is completed`,
      )
    }
    if (window.safetyOnly && input.reason !== 'SAFETY') {
      throw businessRule(
        'SAFETY_ONLY',
        'While the job is in progress, only safety problems can be reported here',
      )
    }
    let dispute
    try {
      ;[dispute] = await tx
        .insert(disputes)
        .values({
          bookingId: booking.id,
          raisedByUserId: actor.userId,
          raisedByRole: side,
          reason: input.reason,
          description: input.description,
          previousBookingStatus: booking.status as BookingStatus,
          createdAt: now,
        })
        .returning()
    } catch (error) {
      if (pgErrorCode(error) === '23505') {
        throw conflict('DISPUTE_OPEN', 'A problem with this booking is already being looked at')
      }
      throw error
    }
    await moveBooking(
      tx,
      booking,
      'DISPUTED',
      { userId: actor.userId, role: side },
      input.reason,
      now,
    )
    await addOutbox(tx, 'dispute.opened', {
      bookingId: booking.id,
      disputeId: dispute.id,
      raisedBy: side,
    })
    return { disputeId: dispute.id, bookingStatus: 'DISPUTED' as const }
  })
}

/** Either party adds a note while the dispute is open. */
export async function addEvidence(actor: Actor, disputeId: string, raw: unknown) {
  const input = evidenceInput.parse(raw)
  if (!isUuid(disputeId)) throw notFound('Report not found')
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ dispute: disputes, customerId: bookings.customerId, workerId: bookings.workerId })
      .from(disputes)
      .innerJoin(bookings, eq(bookings.id, disputes.bookingId))
      .where(eq(disputes.id, disputeId))
    if (!row || !sideOf(actor, row)) throw notFound('Report not found')
    if (!(OPEN_STATUSES as readonly string[]).includes(row.dispute.status)) {
      throw conflict('DISPUTE_CLOSED', 'This report has already been resolved')
    }
    const [added] = await tx
      .insert(disputeEvidence)
      .values({ disputeId, uploadedByUserId: actor.userId, note: input.note })
      .returning()
    return { id: added.id, note: added.note, createdAt: added.createdAt.toISOString() }
  })
}

export type DisputeView = {
  id: string
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED'
  reason: DisputeReason
  description: string
  raisedBy: Side
  outcome: 'CUSTOMER_FAVOUR' | 'WORKER_FAVOUR' | 'SPLIT' | 'NO_ACTION' | null
  resolutionNote: string | null
  refundedPaise: number
  createdAt: string
  resolvedAt: string | null
  version: number
  notes: { id: string; by: Side | 'ADMIN'; note: string; createdAt: string }[]
}

async function loadView(disputeId: string): Promise<DisputeView> {
  const db = getDb()
  const [d] = await db
    .select({ dispute: disputes, customerId: bookings.customerId })
    .from(disputes)
    .innerJoin(bookings, eq(bookings.id, disputes.bookingId))
    .where(eq(disputes.id, disputeId))
  const [notes, [refunded]] = await Promise.all([
    db.execute<{
      id: string
      note: string
      created_at: Date | string
      uploaded_by_user_id: string
      is_admin: boolean
    }>(sql`
      select e.id, e.note, e.created_at, e.uploaded_by_user_id,
             'ADMIN' = any(u.roles) as is_admin
      from dispute_evidence e join users u on u.id = e.uploaded_by_user_id
      where e.dispute_id = ${disputeId} and e.note is not null
      order by e.created_at`),
    db.execute<{ total: number }>(sql`
      select coalesce(sum(amount_paise), 0)::int as total from refunds
      where dispute_id = ${disputeId} and status <> 'FAILED'`),
  ])
  const x = d.dispute
  return {
    id: x.id,
    status: x.status,
    reason: x.reason,
    description: x.description,
    raisedBy: x.raisedByRole as Side,
    outcome: x.outcome,
    resolutionNote: x.resolutionNote,
    refundedPaise: refunded.total,
    createdAt: x.createdAt.toISOString(),
    resolvedAt: iso(x.resolvedAt),
    version: x.version,
    notes: notes.map((n) => ({
      id: n.id,
      by: n.is_admin ? 'ADMIN' : n.uploaded_by_user_id === d.customerId ? 'CUSTOMER' : 'WORKER',
      note: n.note,
      createdAt: iso(n.created_at)!,
    })),
  }
}

/** The latest report on a booking, for its customer or professional (null if none). */
export async function bookingDispute(
  actor: Actor,
  booking: { id: string; customerId: string; workerId: string | null },
): Promise<DisputeView | null> {
  if (!sideOf(actor, booking)) return null
  const [latest] = await getDb()
    .select({ id: disputes.id })
    .from(disputes)
    .where(eq(disputes.bookingId, booking.id))
    .orderBy(desc(disputes.createdAt))
    .limit(1)
  return latest ? loadView(latest.id) : null
}

// ---------------------------------------------------------------------------------------
// Admin

export const adminDisputeQuery = z.object({
  status: z.enum(['OPEN', 'CLOSED', 'ALL']).default('OPEN'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
})

export type AdminDisputeItem = {
  id: string
  status: DisputeView['status']
  reason: DisputeReason
  raisedBy: Side
  outcome: DisputeView['outcome']
  createdAt: string
  booking: { id: string; code: string; serviceName: string }
  customerName: string | null
  workerName: string | null
}

const PAGE = 25

/** Open reports oldest first (work the queue in order); closed ones newest first. */
export async function listAdminDisputes(raw: unknown) {
  const q = adminDisputeQuery.parse(raw)
  const filter =
    q.status === 'OPEN'
      ? sql`d.status in ('OPEN', 'UNDER_REVIEW')`
      : q.status === 'CLOSED'
        ? sql`d.status in ('RESOLVED', 'REJECTED')`
        : sql`true`
  const order = q.status === 'OPEN' ? sql`d.created_at asc` : sql`d.created_at desc`
  const rows = await getDb().execute<{
    id: string
    status: DisputeView['status']
    reason: DisputeReason
    raised_by_role: Side
    outcome: DisputeView['outcome']
    created_at: Date | string
    booking_id: string
    code: string
    service_name: string
    customer_name: string | null
    worker_name: string | null
  }>(sql`
    select d.id, d.status, d.reason, d.raised_by_role, d.outcome, d.created_at,
           b.id as booking_id, b.code, s.name as service_name,
           u.name as customer_name, w.display_name as worker_name
    from disputes d
    join bookings b on b.id = d.booking_id
    join services s on s.id = b.service_id
    join users u on u.id = b.customer_id
    left join worker_profiles w on w.id = b.worker_id
    where ${filter}
    order by ${order}, d.id
    limit ${PAGE + 1} offset ${(q.page - 1) * PAGE}`)
  return {
    items: rows.slice(0, PAGE).map((r): AdminDisputeItem => ({
      id: r.id,
      status: r.status,
      reason: r.reason,
      raisedBy: r.raised_by_role,
      outcome: r.outcome,
      createdAt: iso(r.created_at)!,
      booking: { id: r.booking_id, code: r.code, serviceName: r.service_name },
      customerName: r.customer_name,
      workerName: r.worker_name,
    })),
    page: q.page,
    hasMore: rows.length > PAGE,
  }
}

export type AdminDisputeDetail = DisputeView & {
  previousBookingStatus: string
  booking: {
    id: string
    code: string
    status: string
    serviceName: string
    finalAmountPaise: number | null
    completedAt: string | null
  }
  customerName: string | null
  workerName: string | null
  payment: {
    id: string
    provider: string
    status: string
    amountPaise: number
    refundedPaise: number
  } | null
}

export async function getAdminDispute(disputeId: string): Promise<AdminDisputeDetail> {
  if (!isUuid(disputeId)) throw notFound('Report not found')
  const db = getDb()
  const [row] = await db.execute<{
    booking_id: string
    previous_booking_status: string
    code: string
    status: string
    service_name: string
    final_amount_paise: number | null
    completed_at: Date | string | null
    customer_name: string | null
    worker_name: string | null
  }>(sql`
    select d.booking_id, d.previous_booking_status, b.code, b.status, s.name as service_name,
           b.final_amount_paise, b.completed_at, u.name as customer_name,
           w.display_name as worker_name
    from disputes d
    join bookings b on b.id = d.booking_id
    join services s on s.id = b.service_id
    join users u on u.id = b.customer_id
    left join worker_profiles w on w.id = b.worker_id
    where d.id = ${disputeId}`)
  if (!row) throw notFound('Report not found')
  const [view, [payment]] = await Promise.all([
    loadView(disputeId),
    db.execute<{
      id: string
      provider: string
      status: string
      amount_paise: number
      refunded: number
    }>(sql`
      select p.id, p.provider, p.status, p.amount_paise,
             coalesce((select sum(r.amount_paise) from refunds r
                       where r.payment_id = p.id and r.status <> 'FAILED'), 0)::int as refunded
      from payments p
      where p.booking_id = ${row.booking_id}
        and p.status in ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED')`),
  ])
  return {
    ...view,
    previousBookingStatus: row.previous_booking_status,
    booking: {
      id: row.booking_id,
      code: row.code,
      status: row.status,
      serviceName: row.service_name,
      finalAmountPaise: row.final_amount_paise,
      completedAt: iso(row.completed_at),
    },
    customerName: row.customer_name,
    workerName: row.worker_name,
    payment: payment
      ? {
          id: payment.id,
          provider: payment.provider,
          status: payment.status,
          amountPaise: payment.amount_paise,
          refundedPaise: payment.refunded,
        }
      : null,
  }
}

export const resolveInput = z.object({
  decision: z.enum(['CUSTOMER_FAVOUR', 'WORKER_FAVOUR', 'SPLIT', 'REJECT']),
  refundPaise: z.number().int().min(0).default(0),
  note: z
    .string()
    .trim()
    .min(10, 'Explain the decision (at least 10 characters); both sides see it')
    .max(2000),
  expectedVersion: z.number().int().positive(),
})

/**
 * Resolves a report in one transaction: the dispute, the booking's status, any refund
 * with its ledger entries, and the audit row.
 *
 * - REJECT: nothing changes hands and the booking returns to where it was.
 * - WORKER_FAVOUR: no refund; the job stands as completed (and can still be paid).
 * - CUSTOMER_FAVOUR: a paid job gets a refund; an unpaid one, or one refunded in full,
 *   is cancelled so nothing is owed.
 * - SPLIT: a paid job gets a partial refund and stands as completed.
 */
export async function resolveDispute(
  admin: Actor,
  disputeId: string,
  raw: unknown,
  context: AuditContext,
  now: Date = new Date(),
) {
  const input = resolveInput.parse(raw)
  if (!isUuid(disputeId)) throw notFound('Report not found')
  return getDb().transaction(async (tx) => {
    const [ref] = await tx
      .select({ bookingId: disputes.bookingId })
      .from(disputes)
      .where(eq(disputes.id, disputeId))
    if (!ref) throw notFound('Report not found')
    const booking = await lockBooking(tx, ref.bookingId)
    const [dispute] = await tx
      .select()
      .from(disputes)
      .where(eq(disputes.id, disputeId))
      .for('update')
    if (!(OPEN_STATUSES as readonly string[]).includes(dispute.status)) {
      throw conflict('DISPUTE_CLOSED', 'This report has already been resolved')
    }
    if (dispute.version !== input.expectedVersion) {
      throw conflict('STALE_VERSION', 'Someone else changed this report. Reload and try again.')
    }

    const payment = await lockPaidPayment(tx, booking.id)
    const remaining = payment ? payment.amountPaise - (await refundedSoFar(tx, payment.id)) : 0
    const refund = input.refundPaise
    const rule = (message: string) => businessRule('INVALID_RESOLUTION', message)
    if (refund > 0 && !payment)
      throw rule('This job has not been paid, so there is nothing to refund')
    if (refund > remaining) {
      throw businessRule(
        'REFUND_TOO_LARGE',
        'The refund is more than what is left of the payment',
        {
          remainingPaise: remaining,
        },
      )
    }
    if ((input.decision === 'REJECT' || input.decision === 'WORKER_FAVOUR') && refund > 0) {
      throw rule('Only a decision in the customer’s favour or a split includes a refund')
    }
    if (input.decision === 'CUSTOMER_FAVOUR' && payment && remaining > 0 && refund === 0) {
      throw rule('Choose how much to refund the customer')
    }
    if (input.decision === 'SPLIT' && (!payment || refund === 0 || refund >= remaining)) {
      throw rule('A split refunds part of a paid job: more than ₹0 and less than the full amount')
    }

    let to: BookingStatus
    if (input.decision === 'REJECT') to = dispute.previousBookingStatus as BookingStatus
    else if (input.decision === 'CUSTOMER_FAVOUR' && (!payment || refund === remaining)) {
      to = 'CANCELLED'
    } else to = 'COMPLETED'
    if (!canTransition('DISPUTED', to, 'ADMIN'))
      throw rule('This booking cannot be closed that way')

    if (refund > 0) {
      await issueRefund(tx, {
        admin,
        booking,
        payment: payment!,
        amountPaise: refund,
        reason: input.note.slice(0, 300),
        disputeId,
      })
    }
    if (to === 'CANCELLED') {
      // Nothing is owed any more: drop an unfinished payment attempt.
      await tx
        .update(payments)
        .set({ status: 'CANCELLED' })
        .where(
          and(eq(payments.bookingId, booking.id), inArray(payments.status, ['CREATED', 'PENDING'])),
        )
    }
    await moveBooking(
      tx,
      booking,
      to,
      { userId: admin.userId, role: 'ADMIN' },
      'Reported problem resolved by Kaamico',
      now,
    )
    const outcome = input.decision === 'REJECT' ? 'NO_ACTION' : input.decision
    await tx
      .update(disputes)
      .set({
        status: input.decision === 'REJECT' ? 'REJECTED' : 'RESOLVED',
        outcome,
        resolutionNote: input.note,
        resolvedByAdminId: admin.userId,
        resolvedAt: now,
        version: dispute.version + 1,
      })
      .where(eq(disputes.id, disputeId))
    await writeAudit(tx, admin, context, {
      action: input.decision === 'REJECT' ? 'DISPUTE_REJECTED' : 'DISPUTE_RESOLVED',
      entityType: 'dispute',
      entityId: disputeId,
      before: { status: dispute.status, bookingStatus: booking.status },
      after: { outcome, bookingStatus: to, refundPaise: refund },
      reason: input.note,
    })
    await addOutbox(tx, 'dispute.resolved', {
      bookingId: booking.id,
      disputeId,
      outcome,
      refundPaise: refund,
    })
    return { disputeId, outcome, bookingStatus: to, refundPaise: refund }
  })
}

/** `bookingDispute` by booking id, for API callers (404 unless a party to the booking). */
export async function disputeForBooking(actor: Actor, bookingId: string) {
  if (!isUuid(bookingId)) throw notFound('Booking not found')
  const [booking] = await getDb()
    .select({ id: bookings.id, customerId: bookings.customerId, workerId: bookings.workerId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
  if (!booking || !sideOf(actor, booking)) throw notFound('Booking not found')
  return bookingDispute(actor, booking)
}
