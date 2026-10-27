import 'server-only'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import {
  bookingCharges,
  bookingInvitations,
  bookings,
  bookingStatusHistory,
  customerProfiles,
  priceOffers,
  workerProfiles,
} from '@/db/schema'
import { AppError, businessRule, conflict, forbidden, notFound } from '@/lib/errors'
import type { Actor } from '@/modules/auth/types'
import { negotiationConfig as config } from '@/modules/negotiation/config'
import { addOutbox, appendHistory, expireDue, lockBooking, type Tx } from './repo'
import { MAX_START_CODE_ATTEMPTS, startCodeMatches } from './start-code'
import { canTransition, OPEN_REQUEST, WORKER_STEPS, type BookingStatus } from './state-machine'

const MINUTE = 60_000
const isUuid = (v: string) => z.uuid().safeParse(v).success

export const transitionInput = z.object({
  to: z.enum(['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED']),
  startCode: z.string().trim().optional(),
  note: z.string().trim().max(300).optional(),
  expectedVersion: z.number().int().positive(),
})

/**
 * The assigned worker moves a job one step forward (§11.3). Starting the job needs the
 * customer's 4-digit code: 5 wrong attempts lock it until support helps.
 */
export async function transition(
  actor: Actor,
  bookingId: string,
  raw: unknown,
  now: Date = new Date(),
) {
  const input = transitionInput.parse(raw)
  if (!isUuid(bookingId)) throw notFound('Booking not found')
  let wrongCode: { attemptsLeft: number } | null = null

  const result = await getDb().transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId)
    if (!actor.workerId || booking.workerId !== actor.workerId) throw notFound('Booking not found')
    if (booking.version !== input.expectedVersion) {
      throw conflict('STALE_VERSION', 'This job changed. Refresh and try again.')
    }
    if (
      WORKER_STEPS[booking.status] !== input.to ||
      !canTransition(booking.status, input.to, 'WORKER')
    ) {
      throw conflict(
        'INVALID_TRANSITION',
        `A ${booking.status.toLowerCase().replace('_', ' ')} job cannot move to ${input.to}`,
        {
          from: booking.status,
          to: input.to,
        },
      )
    }

    const patch: Partial<typeof bookings.$inferInsert> = {}
    if (input.to === 'EN_ROUTE' && booking.timing === 'SCHEDULED') {
      const [{ start }] = await tx.execute<{ start: Date | string }>(
        sql`select lower(slot) as start from bookings where id = ${booking.id}`,
      )
      if (now.getTime() < new Date(start).getTime() - config.enRouteLeadMinutes * MINUTE) {
        throw businessRule(
          'TOO_EARLY',
          `You can set off up to ${config.enRouteLeadMinutes} minutes before the job`,
        )
      }
    }
    if (input.to === 'IN_PROGRESS') {
      if (booking.startCodeAttempts >= MAX_START_CODE_ATTEMPTS) {
        throw businessRule('START_CODE_LOCKED', 'Too many wrong codes. Contact Kaamico support.')
      }
      if (
        !booking.startCodeHash ||
        !startCodeMatches(booking.id, input.startCode ?? '', booking.startCodeHash)
      ) {
        // Count the attempt and commit it; the error is raised after the transaction.
        const attempts = booking.startCodeAttempts + 1
        await tx
          .update(bookings)
          .set({ startCodeAttempts: attempts })
          .where(eq(bookings.id, booking.id))
        wrongCode = { attemptsLeft: MAX_START_CODE_ATTEMPTS - attempts }
        return null
      }
      patch.startedAt = now
    }
    if (input.to === 'COMPLETED') {
      const [pending] = await tx
        .select({ n: count() })
        .from(bookingCharges)
        .where(and(eq(bookingCharges.bookingId, booking.id), eq(bookingCharges.status, 'PROPOSED')))
      if (pending.n > 0) {
        throw conflict('CHARGES_PENDING', 'The customer has not answered your extra charge yet')
      }
      patch.completedAt = now
      await tx
        .update(workerProfiles)
        .set({ completedJobs: sql`${workerProfiles.completedJobs} + 1` })
        .where(eq(workerProfiles.id, booking.workerId!))
    }

    await tx
      .update(bookings)
      .set({ ...patch, status: input.to, version: booking.version + 1 })
      .where(eq(bookings.id, booking.id))
    await appendHistory(tx, {
      bookingId: booking.id,
      from: booking.status,
      to: input.to,
      actorUserId: actor.userId,
      actorRole: 'WORKER',
      reason: input.note,
    })
    await addOutbox(tx, `booking.${input.to.toLowerCase()}`, { bookingId: booking.id })
    return { bookingId: booking.id, status: input.to, version: booking.version + 1 }
  })

  if (wrongCode) {
    const { attemptsLeft } = wrongCode
    throw businessRule(
      attemptsLeft > 0 ? 'START_CODE_INVALID' : 'START_CODE_LOCKED',
      attemptsLeft > 0
        ? 'That code is not right. Ask the customer to check the code in their app.'
        : 'Too many wrong codes. Contact Kaamico support.',
      { attemptsLeft },
    )
  }
  return result!
}

export const cancelInput = z.object({
  reason: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
  expectedVersion: z.number().int().positive(),
})

/** Withdraws pending offers and closes open invitations when a request ends early. */
export async function closeRequestThread(tx: Tx, bookingId: string, now: Date) {
  await tx
    .update(priceOffers)
    .set({ status: 'WITHDRAWN', respondedAt: now })
    .where(and(eq(priceOffers.bookingId, bookingId), eq(priceOffers.status, 'PENDING')))
  await tx
    .update(bookingInvitations)
    .set({ status: 'LOST', respondedAt: now })
    .where(
      and(
        eq(bookingInvitations.bookingId, bookingId),
        inArray(bookingInvitations.status, ['INVITED', 'SEEN', 'QUOTED']),
      ),
    )
}

async function arrivedAt(tx: Tx, bookingId: string): Promise<Date | null> {
  const [row] = await tx
    .select({ at: bookingStatusHistory.createdAt })
    .from(bookingStatusHistory)
    .where(
      and(
        eq(bookingStatusHistory.bookingId, bookingId),
        eq(bookingStatusHistory.toStatus, 'ARRIVED'),
      ),
    )
    .orderBy(sql`${bookingStatusHistory.createdAt} desc`)
    .limit(1)
  return row?.at ?? null
}

/**
 * Cancels per the policy in §11.3. Customers cancel free until the professional sets off;
 * afterwards a visit fee is recorded. Workers can cancel a confirmed job (it counts
 * against their reliability) or a no-show 20 minutes after arriving.
 */
export async function cancelBooking(
  actor: Actor,
  bookingId: string,
  raw: unknown,
  now: Date = new Date(),
) {
  const input = cancelInput.parse(raw)
  if (!isUuid(bookingId)) throw notFound('Booking not found')
  await expireDue(now, bookingId)
  return getDb().transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId)
    const isCustomer = booking.customerId === actor.userId
    const isWorker = !!actor.workerId && booking.workerId === actor.workerId
    if (!isCustomer && !isWorker) throw notFound('Booking not found')
    if (booking.version !== input.expectedVersion) {
      throw conflict('STALE_VERSION', 'This booking changed. Refresh and try again.')
    }
    const by = isCustomer ? 'CUSTOMER' : 'WORKER'
    if (!canTransition(booking.status, 'CANCELLED', by)) {
      throw conflict(
        'INVALID_TRANSITION',
        booking.status === 'IN_PROGRESS'
          ? 'The job has started. Report a problem instead of cancelling.'
          : 'This booking can no longer be cancelled',
        { status: booking.status },
      )
    }

    const metadata: Record<string, unknown> = {}
    if (isCustomer && (booking.status === 'EN_ROUTE' || booking.status === 'ARRIVED')) {
      const [p] = await tx.execute<{ min_charge_paise: number }>(sql`
        select min_charge_paise from worker_service_pricing
        where worker_id = ${booking.workerId} and service_id = ${booking.serviceId}`)
      // Collected with payments (Phase 10); recorded now so the policy is auditable.
      metadata.visitFeePaise = Math.min(
        config.visitFeePaise,
        p?.min_charge_paise ?? config.visitFeePaise,
      )
    }
    if (isWorker) {
      if (!input.reason)
        throw new AppError('VALIDATION_FAILED', 'Tell the customer why you are cancelling')
      if (booking.status === 'ARRIVED') {
        const arrived = await arrivedAt(tx, booking.id)
        if (!arrived || now.getTime() - arrived.getTime() < config.noShowMinutes * MINUTE) {
          throw businessRule(
            'NO_SHOW_TOO_EARLY',
            `You can cancel for a no-show ${config.noShowMinutes} minutes after arriving`,
          )
        }
        metadata.noShow = true
      } else {
        await tx
          .update(workerProfiles)
          .set({ cancellationsByWorker: sql`${workerProfiles.cancellationsByWorker} + 1` })
          .where(eq(workerProfiles.id, booking.workerId!))
      }
    }
    if (isCustomer && !OPEN_REQUEST.includes(booking.status)) {
      await tx
        .update(customerProfiles)
        .set({ cancellationsCount: sql`${customerProfiles.cancellationsCount} + 1` })
        .where(eq(customerProfiles.userId, actor.userId))
    }
    if (OPEN_REQUEST.includes(booking.status)) await closeRequestThread(tx, booking.id, now)

    await tx
      .update(bookings)
      .set({
        status: 'CANCELLED',
        cancelledBy: by,
        cancellationReason: input.reason,
        cancelledAt: now,
        version: booking.version + 1,
      })
      .where(eq(bookings.id, booking.id))
    await appendHistory(tx, {
      bookingId: booking.id,
      from: booking.status,
      to: 'CANCELLED',
      actorUserId: actor.userId,
      actorRole: by,
      reason: input.reason,
      metadata,
    })
    await addOutbox(tx, 'booking.cancelled', { bookingId: booking.id, by })
    return { bookingId: booking.id, status: 'CANCELLED' as BookingStatus, ...metadata }
  })
}

/** The invited professional turns a DIRECT request down: it is cancelled so the customer can choose someone else. */
export async function declineRequest(
  actor: Actor,
  invitationId: string,
  raw: unknown,
  now: Date = new Date(),
) {
  const { reason } = z.object({ reason: z.string().trim().max(200).optional() }).parse(raw ?? {})
  if (!isUuid(invitationId) || !actor.workerId) throw notFound('Request not found')
  const [inv] = await getDb()
    .select({ bookingId: bookingInvitations.bookingId, workerId: bookingInvitations.workerId })
    .from(bookingInvitations)
    .where(eq(bookingInvitations.id, invitationId))
  if (!inv || inv.workerId !== actor.workerId) throw notFound('Request not found')
  await expireDue(now, inv.bookingId)

  return getDb().transaction(async (tx) => {
    const booking = await lockBooking(tx, inv.bookingId)
    if (!OPEN_REQUEST.includes(booking.status)) {
      throw conflict('INVALID_TRANSITION', 'This request is no longer open', {
        status: booking.status,
      })
    }
    await tx
      .update(priceOffers)
      .set({ status: 'REJECTED', respondedAt: now, respondedByUserId: actor.userId })
      .where(
        and(
          eq(priceOffers.bookingId, booking.id),
          eq(priceOffers.workerId, actor.workerId!),
          eq(priceOffers.status, 'PENDING'),
        ),
      )
    await tx
      .update(bookingInvitations)
      .set({ status: 'DECLINED', respondedAt: now })
      .where(eq(bookingInvitations.id, invitationId))
    if (booking.mode === 'BROADCAST') {
      // Quick match: the others may still accept. Only when nobody is left does it end.
      const [left] = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from booking_invitations
        where booking_id = ${booking.id} and status in ('INVITED', 'SEEN', 'QUOTED')`)
      if (left.n > 0) {
        await tx
          .update(bookings)
          .set({ version: booking.version + 1 })
          .where(eq(bookings.id, booking.id))
        return { bookingId: booking.id, status: booking.status }
      }
    }
    await tx
      .update(bookings)
      .set({
        status: 'CANCELLED',
        cancelledBy: 'SYSTEM',
        cancellationReason: 'The professional declined',
        cancelledAt: now,
        version: booking.version + 1,
      })
      .where(eq(bookings.id, booking.id))
    await appendHistory(tx, {
      bookingId: booking.id,
      from: booking.status,
      to: 'CANCELLED',
      actorUserId: actor.userId,
      actorRole: 'SYSTEM',
      reason: 'The professional declined',
      metadata: reason ? { workerReason: reason } : undefined,
    })
    await addOutbox(tx, 'request.declined', { bookingId: booking.id })
    return { bookingId: booking.id, status: 'CANCELLED' as const }
  })
}

export const chargeInput = z.object({
  kind: z.enum(['MATERIALS', 'EXTRA_WORK', 'OTHER']),
  description: z.string().trim().min(3, 'Describe the extra charge').max(200),
  amountPaise: z
    .number()
    .int()
    .min(100)
    .max(config.maxChargePaise, 'An extra charge can be at most ₹50,000'),
})

/** The assigned worker proposes an extra charge on site. It counts only if the customer approves. */
export async function proposeCharge(actor: Actor, bookingId: string, raw: unknown) {
  const input = chargeInput.parse(raw)
  if (!isUuid(bookingId)) throw notFound('Booking not found')
  return getDb().transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId)
    if (!actor.workerId || booking.workerId !== actor.workerId) throw notFound('Booking not found')
    if (booking.status !== 'ARRIVED' && booking.status !== 'IN_PROGRESS') {
      throw conflict('INVALID_TRANSITION', 'Extra charges can be added once you have arrived')
    }
    const [existing] = await tx
      .select({ n: count() })
      .from(bookingCharges)
      .where(eq(bookingCharges.bookingId, booking.id))
    if (existing.n >= config.maxChargesPerBooking) {
      throw businessRule(
        'TOO_MANY_CHARGES',
        `At most ${config.maxChargesPerBooking} extra charges per booking`,
      )
    }
    const [charge] = await tx
      .insert(bookingCharges)
      .values({ bookingId: booking.id, proposedByWorkerId: actor.workerId, ...input })
      .returning({ id: bookingCharges.id })
    await tx
      .update(bookings)
      .set({ version: sql`${bookings.version} + 1` })
      .where(eq(bookings.id, booking.id))
    await addOutbox(tx, 'charge.proposed', { bookingId: booking.id, chargeId: charge.id })
    return { chargeId: charge.id }
  })
}

/** The customer approves or rejects a proposed charge; approval raises the total in the same transaction. */
export async function decideCharge(
  actor: Actor,
  chargeId: string,
  decision: 'APPROVED' | 'REJECTED',
  now: Date = new Date(),
) {
  if (!isUuid(chargeId)) throw notFound('Charge not found')
  const [ref] = await getDb()
    .select({ bookingId: bookingCharges.bookingId })
    .from(bookingCharges)
    .where(eq(bookingCharges.id, chargeId))
  if (!ref) throw notFound('Charge not found')
  return getDb().transaction(async (tx) => {
    const booking = await lockBooking(tx, ref.bookingId)
    if (booking.customerId !== actor.userId) {
      // The worker who proposed it must never approve their own charge.
      if (actor.workerId && booking.workerId === actor.workerId)
        throw forbidden('Only the customer can decide on an extra charge')
      throw notFound('Charge not found')
    }
    const [charge] = await tx
      .select()
      .from(bookingCharges)
      .where(eq(bookingCharges.id, chargeId))
      .for('update')
    if (charge.status !== 'PROPOSED')
      throw conflict('CHARGE_DECIDED', 'This charge has already been answered')
    await tx
      .update(bookingCharges)
      .set({ status: decision, decidedAt: now, decidedByUserId: actor.userId })
      .where(eq(bookingCharges.id, chargeId))
    const approved = decision === 'APPROVED' ? charge.amountPaise : 0
    await tx
      .update(bookings)
      .set({
        approvedChargesPaise: sql`${bookings.approvedChargesPaise} + ${approved}`,
        version: booking.version + 1,
      })
      .where(eq(bookings.id, booking.id))
    await appendHistory(tx, {
      bookingId: booking.id,
      from: booking.status,
      to: booking.status,
      actorUserId: actor.userId,
      actorRole: 'CUSTOMER',
      reason: decision === 'APPROVED' ? 'Extra charge approved' : 'Extra charge declined',
      metadata: { chargeId, amountPaise: charge.amountPaise },
    })
    await addOutbox(tx, `charge.${decision.toLowerCase()}`, { bookingId: booking.id, chargeId })
    return {
      chargeId,
      status: decision,
      approvedChargesPaise: booking.approvedChargesPaise + approved,
    }
  })
}
