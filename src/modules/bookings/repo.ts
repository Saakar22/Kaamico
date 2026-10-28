import 'server-only'
import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import { getDb, type Database } from '@/db/client'
import {
  bookingInvitations,
  bookings,
  bookingStatusHistory,
  outboxEvents,
  priceOffers,
} from '@/db/schema'
import { notFound } from '@/lib/errors'
import type { BookingStatus, TransitionActor } from './state-machine'

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
export type BookingRow = typeof bookings.$inferSelect

/** Locks a booking row for the rest of the transaction (every booking mutation starts here). */
export async function lockBooking(tx: Tx, bookingId: string): Promise<BookingRow> {
  const [row] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).for('update')
  if (!row) throw notFound('Booking not found')
  return row
}

export async function appendHistory(
  tx: Tx,
  entry: {
    bookingId: string
    from: BookingStatus | null
    to: BookingStatus
    actorUserId: string | null
    actorRole: TransitionActor
    reason?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await tx.insert(bookingStatusHistory).values({
    bookingId: entry.bookingId,
    fromStatus: entry.from,
    toStatus: entry.to,
    actorUserId: entry.actorUserId,
    actorRole: entry.actorRole,
    reason: entry.reason ?? null,
    metadata: entry.metadata,
  })
}

/** Written in the same transaction as the change; delivered by `modules/notifications/dispatcher`. */
export async function addOutbox(
  tx: Tx,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.insert(outboxEvents).values({ topic, payload })
}

/** Whose requests to expire: one booking, one person's, or (sweeper) everyone's. */
export type ExpiryScope = string | { customerId: string } | { workerId: string } | undefined

function bookingsIn(scope: ExpiryScope) {
  if (scope === undefined) return undefined
  if (typeof scope === 'string') return eq(bookings.id, scope)
  if ('customerId' in scope) return eq(bookings.customerId, scope.customerId)
  return sql`exists (select 1 from ${bookingInvitations} i
    where i.booking_id = ${bookings.id} and i.worker_id = ${scope.workerId})`
}

/**
 * Lazy expiry: marks lapsed PENDING offers EXPIRED and lapsed open requests EXPIRED, for
 * one booking, one person's bookings (pages listing them), or all of them (the sweeper).
 * Rows another transaction holds are skipped (the next read or sweep gets them), so page
 * loads never queue behind each other. Runs in its own transaction so the result is kept
 * even when the caller's request then fails.
 */
export async function expireDue(
  now: Date,
  scope?: ExpiryScope,
): Promise<{ offers: number; bookings: number }> {
  return getDb().transaction(async (tx) => {
    const mine = bookingsIn(scope)
    const lapsed = tx
      .select({ id: priceOffers.id })
      .from(priceOffers)
      .where(
        and(
          eq(priceOffers.status, 'PENDING'),
          lte(priceOffers.expiresAt, now),
          mine
            ? inArray(
                priceOffers.bookingId,
                tx.select({ id: bookings.id }).from(bookings).where(mine),
              )
            : undefined,
        ),
      )
      .for('update', { skipLocked: true })
    const expiredOffers = await tx
      .update(priceOffers)
      .set({ status: 'EXPIRED', respondedAt: now })
      .where(inArray(priceOffers.id, lapsed))
      .returning({ id: priceOffers.id })

    const due = await tx
      .select({ id: bookings.id, status: bookings.status })
      .from(bookings)
      .where(
        and(
          inArray(bookings.status, ['REQUESTED', 'NEGOTIATING']),
          lte(bookings.expiresAt, now),
          mine,
        ),
      )
      .for('update', { skipLocked: true })
    for (const b of due) {
      await tx
        .update(bookings)
        .set({ status: 'EXPIRED', version: sql`${bookings.version} + 1` })
        .where(eq(bookings.id, b.id))
      // Any offer still pending on an expired request lapses with it.
      await tx
        .update(priceOffers)
        .set({ status: 'EXPIRED', respondedAt: now })
        .where(and(eq(priceOffers.bookingId, b.id), eq(priceOffers.status, 'PENDING')))
      await tx
        .update(bookingInvitations)
        .set({ status: 'EXPIRED' })
        .where(
          and(
            eq(bookingInvitations.bookingId, b.id),
            inArray(bookingInvitations.status, ['INVITED', 'SEEN', 'QUOTED']),
          ),
        )
      await appendHistory(tx, {
        bookingId: b.id,
        from: b.status,
        to: 'EXPIRED',
        actorUserId: null,
        actorRole: 'SYSTEM',
        reason: 'No agreement before the request expired',
      })
      await addOutbox(tx, 'booking.expired', { bookingId: b.id })
    }
    return { offers: expiredOffers.length, bookings: due.length }
  })
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Human-friendly booking reference, e.g. KMC-7Q4X9P (no 0/O or 1/I/L to misread). */
export function newBookingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return `KMC-${[...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')}`
}
