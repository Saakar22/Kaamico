import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
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
import { businessRule, conflict, forbidden, pgErrorCode } from '@/lib/errors'
import { haversineKm } from '@/lib/geo'
import { addressForBooking } from '@/modules/addresses/addresses'
import { hasRole, type Actor } from '@/modules/auth/types'
import { earliestStart } from '@/modules/availability/slots'
import { isBlocked } from '@/modules/favorites/blocks'
import { matchingConfig } from '@/modules/matching/config'
import { negotiationConfig } from '@/modules/negotiation/config'
import { assertOfferAllowed, offerExpiry, requestExpiry } from '@/modules/negotiation/rules'
import { checkSlot, isAvailableNow, lockEligibleWorker } from './eligibility'
import { addOutbox, appendHistory, newBookingCode } from './repo'
import { OPEN_REQUEST } from './state-machine'

export const createBookingInput = z
  .object({
    serviceId: z.uuid(),
    workerId: z.uuid(),
    timing: z.enum(['ON_DEMAND', 'SCHEDULED']),
    /** Required for SCHEDULED; on-demand jobs start now. */
    requestedStart: z.iso.datetime({ offset: true }).optional(),
    addressId: z.uuid(),
    description: z
      .string()
      .trim()
      .max(1000, 'Keep the description under 1000 characters')
      .optional()
      .transform((v) => v || null),
    priceDecision: z.discriminatedUnion('type', [
      z.object({ type: z.literal('ACCEPT_LISTED') }),
      z.object({ type: z.literal('OFFER'), amountPaise: z.number().int().positive() }),
    ]),
  })
  .refine((b) => b.timing === 'ON_DEMAND' || b.requestedStart, {
    message: 'Choose a time',
    path: ['requestedStart'],
  })

export type CreateBookingInput = z.input<typeof createBookingInput>

const MINUTE = 60_000

/**
 * Creates a booking request (IMPLEMENTATION_PLAN.md §10.6). The worker always has to
 * consent: even "accept listed price" becomes a customer offer at that price.
 */
export async function createBooking(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
  now: Date = new Date(),
): Promise<{ bookingId: string; code: string }> {
  if (!hasRole(actor, 'CUSTOMER')) throw forbidden('Only customers can book services')
  const input = createBookingInput.parse(raw)
  const address = await addressForBooking(actor.userId, input.addressId)
  if (await isBlocked(actor.userId, input.workerId)) {
    throw businessRule('WORKER_BLOCKED', 'You blocked this professional. Unblock them to book.')
  }

  let start: Date
  if (input.timing === 'ON_DEMAND') {
    start = now
  } else {
    start = new Date(input.requestedStart!)
    const { leadMinutes, gridMinutes, maxAheadDays } = matchingConfig.scheduling
    if (start < earliestStart(now, leadMinutes, gridMinutes)) {
      throw businessRule('START_TOO_SOON', `Choose a time at least ${leadMinutes} minutes from now`)
    }
    if (start.getTime() > now.getTime() + maxAheadDays * 24 * 60 * MINUTE) {
      throw businessRule('START_TOO_FAR', `You can book up to ${maxAheadDays} days ahead`)
    }
  }

  try {
    return await getDb().transaction(async (tx) => {
      // Serialise this customer's requests so the open-request limits hold under races.
      await tx.execute(sql`select 1 from users where id = ${actor.userId} for update`)
      const open = await tx
        .select({ bookingId: bookings.id, workerId: bookingInvitations.workerId })
        .from(bookings)
        .innerJoin(bookingInvitations, eq(bookingInvitations.bookingId, bookings.id))
        .where(
          and(eq(bookings.customerId, actor.userId), inArray(bookings.status, [...OPEN_REQUEST])),
        )
      if (open.some((o) => o.workerId === input.workerId)) {
        throw conflict(
          'DUPLICATE_REQUEST',
          'You already have an open request with this professional',
        )
      }
      // A quick match invites several professionals but is one request.
      if (
        new Set(open.map((o) => o.bookingId)).size >=
        negotiationConfig.limits.openRequestsPerCustomer
      ) {
        throw businessRule(
          'TOO_MANY_OPEN_REQUESTS',
          `You can have up to ${negotiationConfig.limits.openRequestsPerCustomer} open requests at a time`,
        )
      }

      const worker = await lockEligibleWorker(tx, input.workerId, input.serviceId, now)
      if (worker.userId === actor.userId) throw forbidden('You cannot book yourself')
      const distanceKm = haversineKm(address.lat, address.lng, worker.baseLat, worker.baseLng)
      if (distanceKm > worker.radiusKm) {
        throw businessRule('OUT_OF_RANGE', `${worker.displayName} does not travel to this address`)
      }
      if (input.timing === 'ON_DEMAND' && !isAvailableNow(worker, now)) {
        throw businessRule('WORKER_UNAVAILABLE', `${worker.displayName} is not available right now`)
      }
      const slot = await checkSlot(worker, input.timing, start, now)
      if (!slot.free) {
        throw conflict('SLOT_TAKEN', `${worker.displayName} is not free at that time`, {
          alternatives: slot.alternatives,
        })
      }

      const listed = worker.pricing.pricePaise
      const amountPaise =
        input.priceDecision.type === 'ACCEPT_LISTED' ? listed : input.priceDecision.amountPaise
      assertOfferAllowed({
        party: 'CUSTOMER',
        amountPaise,
        thread: [],
        terms: {
          listedPricePaise: listed,
          minChargePaise: worker.pricing.minChargePaise,
          negotiable: worker.pricing.negotiable,
        },
      })

      const expiresAt = requestExpiry(input.timing, start, now)
      const [booking] = await tx
        .insert(bookings)
        .values({
          code: newBookingCode(),
          customerId: actor.userId,
          serviceId: worker.serviceId,
          categoryId: worker.categoryId,
          mode: 'DIRECT',
          timing: input.timing,
          requestedStart: start,
          addressId: address.id,
          addressSnapshot: address.snapshot,
          jobLat: address.lat,
          jobLng: address.lng,
          localityLabel: address.localityLabel,
          description: input.description,
          customerInitialOfferPaise: amountPaise,
          listedPricePaise: listed,
          commissionBps: getEnv().COMMISSION_BPS,
          idempotencyKey,
          expiresAt,
        })
        .returning({ id: bookings.id, code: bookings.code })
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
        amountPaise,
        round: 1,
        expiresAt: offerExpiry(input.timing, start, expiresAt, now),
      })
      await tx
        .update(workerProfiles)
        .set({ totalInvitations: sql`${workerProfiles.totalInvitations} + 1` })
        .where(eq(workerProfiles.id, worker.workerId))
      await tx.insert(customerProfiles).values({ userId: actor.userId }).onConflictDoNothing()
      await appendHistory(tx, {
        bookingId: booking.id,
        from: null,
        to: 'REQUESTED',
        actorUserId: actor.userId,
        actorRole: 'CUSTOMER',
        metadata: { amountPaise, listedPricePaise: listed },
      })
      await addOutbox(tx, 'booking.requested', { bookingId: booking.id, workerId: worker.workerId })
      return { bookingId: booking.id, code: booking.code }
    })
  } catch (error) {
    // Same customer and Idempotency-Key racing past the idempotency table: one insert wins.
    if (
      pgErrorCode(error) === '23505' &&
      String((error as Error).message).includes('idempotency')
    ) {
      throw conflict('CONFLICT', 'This booking request is already being processed')
    }
    throw error
  }
}
