import 'server-only'
import { and, countDistinct, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getEnv } from '@/config/env'
import { getDb } from '@/db/client'
import {
  bookingInvitations,
  bookings,
  customerProfiles,
  priceOffers,
  workerProfiles,
} from '@/db/schema'
import { AppError, businessRule, forbidden, pgErrorCode, conflict } from '@/lib/errors'
import { haversineKm } from '@/lib/geo'
import { addressForBooking } from '@/modules/addresses/addresses'
import { hasRole, type Actor } from '@/modules/auth/types'
import { searchProfessionals } from '@/modules/matching/search'
import { negotiationConfig } from '@/modules/negotiation/config'
import { offerExpiry, requestExpiry } from '@/modules/negotiation/rules'
import { checkSlot, isAvailableNow, lockEligibleWorker, type LockedWorker } from './eligibility'
import { addOutbox, appendHistory, newBookingCode } from './repo'
import { OPEN_REQUEST } from './state-machine'

/**
 * "Quick match" (IMPLEMENTATION_PLAN.md §14 P1, BROADCAST mode): one on-demand request
 * sent to up to five nearby professionals who are free now, each at their own listed
 * price. The first to accept is booked; the acceptance algorithm (booking row lock, then
 * worker row, then the no-overlap constraint) guarantees exactly one winner, and every
 * other invitation becomes LOST.
 */

export const QUICK_MATCH_SIZE = 5
/** Ranked candidates considered, so a few ineligible ones still leave five to invite. */
const CANDIDATE_POOL = 12

export const quickMatchInput = z.object({
  mode: z.literal('BROADCAST'),
  serviceId: z.uuid(),
  addressId: z.uuid(),
  description: z
    .string()
    .trim()
    .max(1000, 'Keep the description under 1000 characters')
    .optional()
    .transform((v) => v || null),
})

export async function createQuickMatch(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
  now: Date = new Date(),
): Promise<{ bookingId: string; code: string; invited: number }> {
  if (!hasRole(actor, 'CUSTOMER')) throw forbidden('Only customers can book services')
  const input = quickMatchInput.parse(raw)
  const address = await addressForBooking(actor.userId, input.addressId)
  const search = await searchProfessionals(
    {
      serviceId: input.serviceId,
      lat: address.lat,
      lng: address.lng,
      when: 'now',
      limit: CANDIDATE_POOL,
    },
    now,
    actor.userId,
  )
  const ranked = search.items.filter((p) => p.availability.now).map((p) => p.workerId)
  const noOne = () =>
    businessRule('NO_ONE_AVAILABLE', 'No professional nearby is free right now', {
      scheduledAlternatives: search.scheduledAlternatives,
    })
  if (ranked.length === 0) throw noOne()

  try {
    return await getDb().transaction(async (tx) => {
      // Serialise this customer's requests so the open-request limit holds under races.
      await tx.execute(sql`select 1 from users where id = ${actor.userId} for update`)
      const [open] = await tx
        .select({ n: countDistinct(bookings.id) })
        .from(bookings)
        .where(
          and(eq(bookings.customerId, actor.userId), inArray(bookings.status, [...OPEN_REQUEST])),
        )
      if (open.n >= negotiationConfig.limits.openRequestsPerCustomer) {
        throw businessRule(
          'TOO_MANY_OPEN_REQUESTS',
          `You can have up to ${negotiationConfig.limits.openRequestsPerCustomer} open requests at a time`,
        )
      }
      const busyWith = await tx
        .select({ workerId: bookingInvitations.workerId })
        .from(bookingInvitations)
        .innerJoin(bookings, eq(bookings.id, bookingInvitations.bookingId))
        .where(
          and(eq(bookings.customerId, actor.userId), inArray(bookings.status, [...OPEN_REQUEST])),
        )
      const skip = new Set(busyWith.map((b) => b.workerId))

      // Lock in id order (two quick matches never wait on each other in a cycle), then
      // keep the best-ranked eligible ones.
      const pool = ranked.filter((id) => !skip.has(id))
      const eligible = new Map<string, { worker: LockedWorker; distanceKm: number }>()
      for (const workerId of [...pool].sort()) {
        let worker: LockedWorker
        try {
          worker = await lockEligibleWorker(tx, workerId, input.serviceId, now)
        } catch (error) {
          if (error instanceof AppError) continue
          throw error
        }
        if (worker.userId === actor.userId || !isAvailableNow(worker, now)) continue
        const distanceKm = haversineKm(address.lat, address.lng, worker.baseLat, worker.baseLng)
        if (distanceKm > worker.radiusKm) continue
        if (!(await checkSlot(worker, 'ON_DEMAND', now, now)).free) continue
        eligible.set(workerId, { worker, distanceKm })
      }
      const invited = pool
        .filter((id) => eligible.has(id))
        .slice(0, QUICK_MATCH_SIZE)
        .map((id) => eligible.get(id)!)
      if (invited.length === 0) throw noOne()

      const first = invited[0].worker
      const expiresAt = requestExpiry('ON_DEMAND', now, now)
      const [booking] = await tx
        .insert(bookings)
        .values({
          code: newBookingCode(),
          customerId: actor.userId,
          serviceId: first.serviceId,
          categoryId: first.categoryId,
          mode: 'BROADCAST',
          timing: 'ON_DEMAND',
          requestedStart: now,
          addressId: address.id,
          addressSnapshot: address.snapshot,
          jobLat: address.lat,
          jobLng: address.lng,
          localityLabel: address.localityLabel,
          description: input.description,
          // Prices differ per professional: each thread starts at that one's listed price.
          customerInitialOfferPaise: null,
          listedPricePaise: null,
          commissionBps: getEnv().COMMISSION_BPS,
          idempotencyKey,
          expiresAt,
        })
        .returning({ id: bookings.id, code: bookings.code })

      for (const { worker, distanceKm } of invited) {
        const [invitation] = await tx
          .insert(bookingInvitations)
          .values({
            bookingId: booking.id,
            workerId: worker.workerId,
            distanceKm: Math.round(distanceKm * 100) / 100,
            expiresAt,
          })
          .returning({ id: bookingInvitations.id })
        await tx.insert(priceOffers).values({
          bookingId: booking.id,
          invitationId: invitation.id,
          workerId: worker.workerId,
          offeredBy: 'CUSTOMER',
          amountPaise: worker.pricing.pricePaise,
          round: 1,
          expiresAt: offerExpiry('ON_DEMAND', now, expiresAt, now),
        })
        await tx
          .update(workerProfiles)
          .set({ totalInvitations: sql`${workerProfiles.totalInvitations} + 1` })
          .where(eq(workerProfiles.id, worker.workerId))
        await addOutbox(tx, 'booking.requested', {
          bookingId: booking.id,
          workerId: worker.workerId,
          quickMatch: true,
        })
      }
      await tx.insert(customerProfiles).values({ userId: actor.userId }).onConflictDoNothing()
      await appendHistory(tx, {
        bookingId: booking.id,
        from: null,
        to: 'REQUESTED',
        actorUserId: actor.userId,
        actorRole: 'CUSTOMER',
        metadata: { quickMatch: true, invited: invited.length },
      })
      return { bookingId: booking.id, code: booking.code, invited: invited.length }
    })
  } catch (error) {
    if (
      pgErrorCode(error) === '23505' &&
      String((error as Error).message).includes('idempotency')
    ) {
      throw conflict('CONFLICT', 'This booking request is already being processed')
    }
    throw error
  }
}
