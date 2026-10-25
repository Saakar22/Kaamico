import 'server-only'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import {
  bookingInvitations,
  bookings,
  negotiationMessages,
  priceOffers,
  workerProfiles,
} from '@/db/schema'
import { AppError, businessRule, conflict, notFound, pgErrorCode } from '@/lib/errors'
import { enforceRateLimit } from '@/lib/rate-limit'
import { authSecret } from '@/lib/secrets'
import type { Actor } from '@/modules/auth/types'
import { jobSlot, lockEligibleWorker, toRange } from '@/modules/bookings/eligibility'
import {
  addOutbox,
  appendHistory,
  expireDue,
  lockBooking,
  type BookingRow,
  type Tx,
} from '@/modules/bookings/repo'
import { deriveStartCode, hashStartCode } from '@/modules/bookings/start-code'
import { OPEN_REQUEST, TERMINAL } from '@/modules/bookings/state-machine'
import { negotiationConfig as config } from './config'
import { assertOfferAllowed, maskContactDetails, offerExpiry, type Party } from './rules'

type Participant = {
  party: Party
  workerId: string
  invitationId: string
  invitationStatus: string
}

/**
 * Who the actor is on this booking's thread. Anyone else gets 404, so other people's
 * bookings are indistinguishable from bookings that do not exist.
 */
async function participantOf(
  tx: Tx,
  actor: Actor,
  booking: BookingRow,
  workerIdHint?: string,
): Promise<Participant> {
  const invitations = await tx
    .select({
      id: bookingInvitations.id,
      workerId: bookingInvitations.workerId,
      status: bookingInvitations.status,
    })
    .from(bookingInvitations)
    .where(eq(bookingInvitations.bookingId, booking.id))
  if (booking.customerId === actor.userId) {
    const inv = workerIdHint ? invitations.find((i) => i.workerId === workerIdHint) : invitations[0]
    if (!inv) throw notFound('Booking not found')
    return {
      party: 'CUSTOMER',
      workerId: inv.workerId,
      invitationId: inv.id,
      invitationStatus: inv.status,
    }
  }
  const inv = actor.workerId ? invitations.find((i) => i.workerId === actor.workerId) : undefined
  if (!inv) throw notFound('Booking not found')
  return {
    party: 'WORKER',
    workerId: inv.workerId,
    invitationId: inv.id,
    invitationStatus: inv.status,
  }
}

async function threadOf(tx: Tx, bookingId: string, workerId: string) {
  return tx
    .select()
    .from(priceOffers)
    .where(and(eq(priceOffers.bookingId, bookingId), eq(priceOffers.workerId, workerId)))
    .orderBy(asc(priceOffers.round))
}

async function pricingTerms(tx: Tx, booking: BookingRow, workerId: string) {
  const [p] = await tx.execute<{
    min_charge_paise: number
    is_negotiable: boolean
    price_paise: number
  }>(sql`
    select min_charge_paise, is_negotiable, price_paise from worker_service_pricing
    where worker_id = ${workerId} and service_id = ${booking.serviceId}`)
  return {
    // The price the customer saw when requesting: later price edits never move it.
    listedPricePaise: booking.listedPricePaise ?? p?.price_paise ?? 0,
    minChargePaise: p?.min_charge_paise ?? 0,
    negotiable: p?.is_negotiable ?? true,
  }
}

function assertOpen(booking: BookingRow, now: Date) {
  if (
    booking.status === 'EXPIRED' ||
    (booking.expiresAt && booking.expiresAt <= now && OPEN_REQUEST.includes(booking.status))
  ) {
    throw new AppError('EXPIRED', 'This request has expired')
  }
  if (!OPEN_REQUEST.includes(booking.status)) {
    throw conflict('INVALID_TRANSITION', 'This request is no longer open for offers', {
      status: booking.status,
    })
  }
}

const verifiedWorker = async (tx: Tx, workerId: string) => {
  const [w] = await tx
    .select({ status: workerProfiles.verificationStatus })
    .from(workerProfiles)
    .where(eq(workerProfiles.id, workerId))
  if (w?.status !== 'VERIFIED') {
    throw businessRule('NOT_VERIFIED', 'Only verified professionals can respond to requests')
  }
}

export const offerInput = z.object({
  workerId: z.uuid().optional(),
  amountPaise: z.number().int().positive(),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null),
})

/** A new offer or counter-offer (§11.2). The other side's pending offer becomes COUNTERED. */
export async function makeOffer(
  actor: Actor,
  bookingId: string,
  raw: unknown,
  now: Date = new Date(),
) {
  const input = offerInput.parse(raw)
  await enforceRateLimit(
    `offers:user:${actor.userId}`,
    config.limits.offers,
    'Too many offers. Please wait a few minutes.',
  )
  if (!z.uuid().safeParse(bookingId).success) throw notFound('Booking not found')
  await expireDue(now, bookingId)

  return getDb().transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId)
    const me = await participantOf(tx, actor, booking, input.workerId)
    assertOpen(booking, now)
    if (me.party === 'WORKER') await verifiedWorker(tx, me.workerId)
    if (['DECLINED', 'EXPIRED', 'LOST'].includes(me.invitationStatus)) {
      throw conflict('INVALID_TRANSITION', 'This request is closed')
    }

    const thread = await threadOf(tx, booking.id, me.workerId)
    const terms = await pricingTerms(tx, booking, me.workerId)
    assertOfferAllowed({
      party: me.party,
      amountPaise: input.amountPaise,
      note: input.note,
      thread,
      terms,
    })

    const other = me.party === 'CUSTOMER' ? 'WORKER' : 'CUSTOMER'
    const theirs = thread.find((o) => o.offeredBy === other && o.status === 'PENDING')
    if (theirs) {
      await tx
        .update(priceOffers)
        .set({ status: 'COUNTERED', respondedAt: now, respondedByUserId: actor.userId })
        .where(eq(priceOffers.id, theirs.id))
    }
    const [created] = await tx
      .insert(priceOffers)
      .values({
        bookingId: booking.id,
        invitationId: me.invitationId,
        workerId: me.workerId,
        offeredBy: me.party,
        amountPaise: input.amountPaise,
        note: input.note,
        round: thread.length + 1,
        parentOfferId: thread.at(-1)?.id ?? null,
        expiresAt: offerExpiry(booking.timing, booking.requestedStart, booking.expiresAt!, now),
      })
      .returning({ id: priceOffers.id })

    if (booking.status === 'REQUESTED') {
      await appendHistory(tx, {
        bookingId: booking.id,
        from: 'REQUESTED',
        to: 'NEGOTIATING',
        actorUserId: actor.userId,
        actorRole: me.party,
        metadata: { offerId: created.id, amountPaise: input.amountPaise },
      })
    }
    await tx
      .update(bookings)
      .set({ status: 'NEGOTIATING', version: sql`${bookings.version} + 1` })
      .where(eq(bookings.id, booking.id))
    if (me.party === 'WORKER') {
      await tx
        .update(bookingInvitations)
        .set({ status: 'QUOTED', respondedAt: now })
        .where(eq(bookingInvitations.id, me.invitationId))
    }
    await addOutbox(tx, 'offer.created', {
      bookingId: booking.id,
      offerId: created.id,
      by: me.party,
    })
    return { offerId: created.id }
  })
}

async function offerContext(tx: Tx, actor: Actor, offerId: string) {
  if (!z.uuid().safeParse(offerId).success) throw notFound('Offer not found')
  const [ref] = await tx
    .select({ bookingId: priceOffers.bookingId })
    .from(priceOffers)
    .where(eq(priceOffers.id, offerId))
  if (!ref) throw notFound('Offer not found')
  // Lock order everywhere: booking, then offer, then worker.
  const booking = await lockBooking(tx, ref.bookingId)
  const [offer] = await tx
    .select()
    .from(priceOffers)
    .where(eq(priceOffers.id, offerId))
    .for('update')
  const me = await participantOf(tx, actor, booking, offer.workerId)
  if (me.workerId !== offer.workerId) throw notFound('Offer not found')
  return { booking, offer, me }
}

const MAX_ATTEMPTS = 2

/**
 * Accepts the other side's pending offer and confirms the booking (§11.2, the critical
 * section). Parallel accepts serialise on the booking row; parallel confirmations for
 * one worker serialise on the worker row, with the no-overlap constraint as backstop.
 */
export async function acceptOffer(
  actor: Actor,
  offerId: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<{ bookingId: string; status: 'CONFIRMED' }> {
  const { expectedBookingVersion } = z
    .object({ expectedBookingVersion: z.number().int().positive() })
    .parse(raw)
  const [ref] = z.uuid().safeParse(offerId).success
    ? await getDb()
        .select({ bookingId: priceOffers.bookingId })
        .from(priceOffers)
        .where(eq(priceOffers.id, offerId))
    : []
  if (ref) await expireDue(now, ref.bookingId)

  for (let attempt = 1; ; attempt++) {
    try {
      return await getDb().transaction(async (tx) => {
        const { booking, offer, me } = await offerContext(tx, actor, offerId)
        if (offer.offeredBy === me.party)
          throw conflict('NOT_YOUR_OFFER', 'You cannot accept your own offer')
        if (booking.version !== expectedBookingVersion) {
          throw conflict('STALE_VERSION', 'This request changed. Refresh to see the latest offer.')
        }
        if (offer.status === 'EXPIRED' || (offer.status === 'PENDING' && offer.expiresAt <= now)) {
          throw new AppError('EXPIRED', 'This offer has expired')
        }
        if (offer.status !== 'PENDING') {
          throw conflict('OFFER_NOT_PENDING', 'This offer is no longer open', {
            status: offer.status,
          })
        }
        assertOpen(booking, now)

        const worker = await lockEligibleWorker(tx, offer.workerId, booking.serviceId, now)
        const start = booking.timing === 'ON_DEMAND' ? now : booking.requestedStart
        const slot = jobSlot(start, worker.durationMin)
        const [timeOff] = await tx.execute(sql`
          select 1 from worker_time_off where worker_id = ${worker.workerId}
            and period && ${toRange(slot)}::tstzrange limit 1`)
        if (timeOff)
          throw conflict('SLOT_TAKEN', `${worker.displayName} is no longer free at that time`)

        await tx
          .update(priceOffers)
          .set({ status: 'ACCEPTED', respondedAt: now, respondedByUserId: actor.userId })
          .where(eq(priceOffers.id, offer.id))
        await tx
          .update(priceOffers)
          .set({ status: 'SUPERSEDED', respondedAt: now })
          .where(
            and(
              eq(priceOffers.bookingId, booking.id),
              eq(priceOffers.status, 'PENDING'),
              ne(priceOffers.id, offer.id),
            ),
          )
        await tx
          .update(bookingInvitations)
          .set({
            status: sql`case when ${bookingInvitations.workerId} = ${worker.workerId} then 'WON'::invitation_status else 'LOST'::invitation_status end`,
            respondedAt: now,
          })
          .where(eq(bookingInvitations.bookingId, booking.id))
        await tx
          .update(bookings)
          .set({
            status: 'CONFIRMED',
            workerId: worker.workerId,
            agreedPricePaise: offer.amountPaise,
            acceptedOfferId: offer.id,
            slot: toRange(slot),
            startCodeHash: hashStartCode(booking.id, deriveStartCode(booking.id, authSecret())),
            confirmedAt: now,
            version: booking.version + 1,
          })
          .where(eq(bookings.id, booking.id))
        await tx
          .update(workerProfiles)
          .set({ acceptedInvitations: sql`${workerProfiles.acceptedInvitations} + 1` })
          .where(eq(workerProfiles.id, worker.workerId))
        await appendHistory(tx, {
          bookingId: booking.id,
          from: booking.status,
          to: 'CONFIRMED',
          actorUserId: actor.userId,
          actorRole: me.party,
          metadata: { offerId: offer.id, agreedPricePaise: offer.amountPaise },
        })
        await addOutbox(tx, 'booking.confirmed', {
          bookingId: booking.id,
          workerId: worker.workerId,
          by: me.party,
        })
        return { bookingId: booking.id, status: 'CONFIRMED' as const }
      })
    } catch (error) {
      const code = pgErrorCode(error)
      if (code === '23P01')
        throw conflict('SLOT_TAKEN', 'The professional is already booked at that time')
      // A deadlock between racing confirmations: retry once, then report a conflict.
      if (code === '40P01') {
        if (attempt < MAX_ATTEMPTS) continue
        throw conflict('SLOT_TAKEN', 'The professional is already booked at that time')
      }
      throw error
    }
  }
}

/** Declines the other side's offer. The thread stays open briefly for a new offer, then lapses. */
export async function rejectOffer(
  actor: Actor,
  offerId: string,
  raw: unknown,
  now: Date = new Date(),
) {
  z.object({ reason: z.string().trim().max(200).optional() }).parse(raw ?? {})
  return getDb().transaction(async (tx) => {
    const { booking, offer, me } = await offerContext(tx, actor, offerId)
    if (offer.offeredBy === me.party)
      throw conflict('NOT_YOUR_OFFER', 'You cannot reject your own offer')
    if (offer.status !== 'PENDING')
      throw conflict('OFFER_NOT_PENDING', 'This offer is no longer open')
    assertOpen(booking, now)
    await tx
      .update(priceOffers)
      .set({ status: 'REJECTED', respondedAt: now, respondedByUserId: actor.userId })
      .where(eq(priceOffers.id, offer.id))
    const grace = new Date(now.getTime() + config.afterRejectMinutes * 60_000)
    const expiresAt = booking.expiresAt && booking.expiresAt < grace ? booking.expiresAt : grace
    if (booking.status === 'REQUESTED') {
      await appendHistory(tx, {
        bookingId: booking.id,
        from: 'REQUESTED',
        to: 'NEGOTIATING',
        actorUserId: actor.userId,
        actorRole: me.party,
        reason: 'Offer declined',
      })
    }
    await tx
      .update(bookings)
      .set({ status: 'NEGOTIATING', expiresAt, version: sql`${bookings.version} + 1` })
      .where(eq(bookings.id, booking.id))
    await addOutbox(tx, 'offer.rejected', { bookingId: booking.id, offerId: offer.id })
    return { bookingId: booking.id }
  })
}

/** Takes back your own pending offer (it still counts towards the round limit). */
export async function withdrawOffer(actor: Actor, offerId: string, now: Date = new Date()) {
  return getDb().transaction(async (tx) => {
    const { booking, offer, me } = await offerContext(tx, actor, offerId)
    if (offer.offeredBy !== me.party) throw notFound('Offer not found')
    if (offer.status !== 'PENDING')
      throw conflict('OFFER_NOT_PENDING', 'This offer is no longer open')
    await tx
      .update(priceOffers)
      .set({ status: 'WITHDRAWN', respondedAt: now, respondedByUserId: actor.userId })
      .where(eq(priceOffers.id, offer.id))
    await tx
      .update(bookings)
      .set({ version: sql`${bookings.version} + 1` })
      .where(eq(bookings.id, booking.id))
    return { bookingId: booking.id }
  })
}

export const messageInput = z.object({
  workerId: z.uuid().optional(),
  body: z.string().trim().min(1, 'Write a message').max(500),
})

/** A short message on the thread. Phone numbers, UPI IDs and emails are masked. */
export async function postMessage(actor: Actor, bookingId: string, raw: unknown) {
  const input = messageInput.parse(raw)
  await enforceRateLimit(
    `messages:user:${actor.userId}`,
    config.limits.messages,
    'Too many messages. Please wait a few minutes.',
  )
  if (!z.uuid().safeParse(bookingId).success) throw notFound('Booking not found')
  return getDb().transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId)
    const me = await participantOf(tx, actor, booking, input.workerId)
    if (TERMINAL.includes(booking.status))
      throw conflict('INVALID_TRANSITION', 'This booking is closed')
    const { text, redacted } = maskContactDetails(input.body)
    const [row] = await tx
      .insert(negotiationMessages)
      .values({
        bookingId: booking.id,
        workerId: me.workerId,
        senderUserId: actor.userId,
        body: text,
        redacted,
      })
      .returning({ id: negotiationMessages.id })
    return { messageId: row.id, body: text, redacted }
  })
}
