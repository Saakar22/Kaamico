import 'server-only'
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { bookingCharges, notifications, outboxEvents, priceOffers } from '@/db/schema'
import { logger } from '@/lib/logger'
import type { Tx } from '@/modules/bookings/repo'
import {
  BOOKING_TOPICS,
  draftNotifications,
  draftVerificationNotification,
  type BookingContext,
} from './templates'

/** After this many failures an event is parked (processed, with `last_error` kept for support). */
export const MAX_ATTEMPTS = 5
const MINUTE = 60_000
const firstName = (name: string | null, fallback: string) =>
  (name ?? fallback).trim().split(/\s+/)[0] || fallback
const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`
/** Drizzle wraps driver errors with the query and its parameters; keep only the cause. */
function failureReason(error: unknown): string {
  const root = error instanceof Error && error.cause instanceof Error ? error.cause : error
  return String(root instanceof Error ? root.message : root).slice(0, 1000)
}
const isUuid = (v: unknown): v is string => typeof v === 'string' && z.uuid().safeParse(v).success

async function bookingContext(
  tx: Tx,
  payload: Record<string, unknown>,
): Promise<BookingContext | null> {
  if (!isUuid(payload.bookingId)) return null
  const [offer] = isUuid(payload.offerId)
    ? await tx
        .select({
          offeredBy: priceOffers.offeredBy,
          amountPaise: priceOffers.amountPaise,
          workerId: priceOffers.workerId,
        })
        .from(priceOffers)
        .where(eq(priceOffers.id, payload.offerId))
    : []
  // Which professional the event is about: the one named in the event or its offer (a
  // quick match invites several, and tells each one who lost), else the assigned one.
  const about = isUuid(payload.workerId) ? payload.workerId : (offer?.workerId ?? null)
  const [row] = await tx.execute<{
    code: string
    service_name: string
    customer_id: string
    customer_name: string | null
    worker_user_id: string
    worker_name: string
    invitation_id: string
    final_amount_paise: number | null
  }>(sql`
    select b.code, s.name as service_name, b.customer_id, cu.name as customer_name,
           w.user_id as worker_user_id, w.display_name as worker_name, i.id as invitation_id,
           b.final_amount_paise
    from bookings b
    join services s on s.id = b.service_id
    join users cu on cu.id = b.customer_id
    join booking_invitations i on i.booking_id = b.id
    join worker_profiles w on w.id = i.worker_id
    where b.id = ${payload.bookingId}
    order by (i.worker_id = coalesce(${about}::uuid, b.worker_id)) desc nulls last
    limit 1`)
  if (!row) return null

  const [charge] = isUuid(payload.chargeId)
    ? await tx
        .select({
          description: bookingCharges.description,
          amountPaise: bookingCharges.amountPaise,
        })
        .from(bookingCharges)
        .where(eq(bookingCharges.id, payload.chargeId))
    : []

  return {
    bookingId: payload.bookingId,
    code: row.code,
    serviceName: row.service_name,
    customerUserId: row.customer_id,
    customerFirstName: firstName(row.customer_name, 'Customer'),
    workerUserId: row.worker_user_id,
    workerFirstName: firstName(row.worker_name, 'Your professional'),
    invitationId: row.invitation_id,
    totalPaise: row.final_amount_paise,
    offer: offer ? { offeredBy: offer.offeredBy, amountPaise: offer.amountPaise } : null,
    charge: charge ?? null,
  }
}

async function verificationDraft(tx: Tx, payload: Record<string, unknown>) {
  if (!isUuid(payload.applicationId)) return null
  const [row] = await tx.execute<{ user_id: string; decision_reason: string | null }>(sql`
    select w.user_id, a.decision_reason from verification_applications a
    join worker_profiles w on w.id = a.worker_id where a.id = ${payload.applicationId}`)
  return row
    ? draftVerificationNotification(payload.decision, row.user_id, row.decision_reason)
    : null
}

async function deliver(tx: Tx, topic: string, payload: Record<string, unknown>): Promise<number> {
  if (topic === 'verification.decided') {
    const draft = await verificationDraft(tx, payload)
    if (draft) await tx.insert(notifications).values(draft)
    return draft ? 1 : 0
  }
  if (!BOOKING_TOPICS.has(topic)) return 0
  const context = await bookingContext(tx, payload)
  if (!context) return 0
  // Names come from users, so clip to the column sizes rather than fail the event.
  const drafts = draftNotifications(topic, payload, context).map((d) => ({
    ...d,
    title: clip(d.title, 120),
    body: d.body === null ? null : clip(d.body, 500),
  }))
  if (drafts.length > 0) await tx.insert(notifications).values(drafts)
  return drafts.length
}

/**
 * Delivers pending outbox events as in-app notifications. Each event is handled in a
 * savepoint and marked processed in the same transaction as its notifications, so an
 * event is delivered exactly once. Concurrent dispatchers skip each other's rows.
 * Failures back off (1, 2, 4… minutes) and are parked after MAX_ATTEMPTS.
 */
export async function dispatchOutbox(
  options: { now?: Date; limit?: number } = {},
): Promise<{ processed: number; notifications: number; failed: number }> {
  const now = options.now ?? new Date()
  // Events are stamped by the database clock; compare with it too unless a time is given.
  const due = options.now ?? sql`now()`
  return getDb().transaction(async (tx) => {
    const events = await tx
      .select()
      .from(outboxEvents)
      .where(and(isNull(outboxEvents.processedAt), lte(outboxEvents.availableAt, due)))
      .orderBy(asc(outboxEvents.id))
      .limit(options.limit ?? 50)
      .for('update', { skipLocked: true })

    let processed = 0
    let sent = 0
    let failed = 0
    for (const event of events) {
      try {
        sent += await tx.transaction((sp) => deliver(sp, event.topic, event.payload))
        await tx
          .update(outboxEvents)
          .set({ processedAt: now, attempts: event.attempts + 1, lastError: null })
          .where(eq(outboxEvents.id, event.id))
        processed++
      } catch (error) {
        failed++
        const attempts = event.attempts + 1
        logger.warn({ err: error, eventId: event.id, topic: event.topic }, 'outbox delivery failed')
        await tx
          .update(outboxEvents)
          .set({
            attempts,
            lastError: failureReason(error),
            availableAt: new Date(now.getTime() + 2 ** (attempts - 1) * MINUTE),
            processedAt: attempts >= MAX_ATTEMPTS ? now : null,
          })
          .where(eq(outboxEvents.id, event.id))
      }
    }
    return { processed, notifications: sent, failed }
  })
}
