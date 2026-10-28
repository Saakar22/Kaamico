import 'server-only'
import { eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { paymentEvents, payments, refunds } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { lockBooking } from '@/modules/bookings/repo'
import { captureOrFlag } from './payments'
import { razorpayConfig, verifyWebhookSignature } from './razorpay'
import { failRefund } from './refunds'

/**
 * Razorpay webhooks (IMPLEMENTATION_PLAN.md §10.11): signature check, then the event is
 * stored in `payment_events` (unique per provider event id, so retries are no-ops) and
 * applied in the same transaction. If applying fails, nothing is stored and Razorpay
 * retries later.
 */

const paymentEntity = z.object({
  id: z.string(),
  order_id: z.string().nullable().optional(),
  amount: z.number().int(),
  error_description: z.string().nullable().optional(),
})
const refundEntity = z.object({
  id: z.string(),
  payment_id: z.string(),
  amount: z.number().int(),
  // Razorpay sends an empty array when there are no notes.
  notes: z.unknown().optional(),
})

/** Our refund id, which we pass to Razorpay in the refund's notes. */
function refundIdFromNotes(notes: unknown): string | null {
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return null
  const id = (notes as Record<string, unknown>).refundId
  return typeof id === 'string' && z.uuid().safeParse(id).success ? id : null
}

const eventSchema = z.object({
  event: z.string(),
  created_at: z.number().int().optional(),
  payload: z
    .object({
      payment: z.object({ entity: paymentEntity }).optional(),
      refund: z.object({ entity: refundEntity }).optional(),
    })
    .default({}),
})

export type WebhookResult = { status: 'processed' | 'duplicate' | 'ignored'; event: string }

export async function handleRazorpayWebhook(
  rawBody: string,
  signature: string | null,
  eventId: string | null,
  now: Date = new Date(),
): Promise<WebhookResult> {
  const { webhookSecret } = razorpayConfig()
  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    throw new AppError('WEBHOOK_SIGNATURE_INVALID', 'Invalid signature', { status: 401 })
  }
  let parsed: z.infer<typeof eventSchema>
  try {
    parsed = eventSchema.parse(JSON.parse(rawBody))
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Unreadable webhook body')
  }
  // Razorpay sends a unique id per event in this header; fall back to a stable digest.
  const providerEventId =
    eventId?.slice(0, 120) ?? `${parsed.event}:${parsed.created_at ?? ''}:${rawBody.length}`

  return getDb().transaction(async (tx) => {
    const [stored] = await tx
      .insert(paymentEvents)
      .values({
        provider: 'RAZORPAY',
        providerEventId,
        type: parsed.event.slice(0, 80),
        payload: JSON.parse(rawBody),
      })
      .onConflictDoNothing()
      .returning({ id: paymentEvents.id })
    if (!stored) return { status: 'duplicate', event: parsed.event }

    let applied = false
    const p = parsed.payload.payment?.entity
    const r = parsed.payload.refund?.entity
    if ((parsed.event === 'payment.captured' || parsed.event === 'payment.failed') && p?.order_id) {
      const [ref] = await tx
        .select({ id: payments.id, bookingId: payments.bookingId })
        .from(payments)
        .where(eq(payments.providerOrderId, p.order_id))
      if (ref) {
        const booking = await lockBooking(tx, ref.bookingId)
        const [payment] = await tx
          .select()
          .from(payments)
          .where(eq(payments.id, ref.id))
          .for('update')
        if (parsed.event === 'payment.captured') {
          if (p.amount !== payment.amountPaise) {
            // Never capture a different amount than the booking's; flag for a human.
            logger.error(
              { paymentId: payment.id, expected: payment.amountPaise, got: p.amount },
              'razorpay captured an unexpected amount',
            )
          } else if (['PENDING', 'FAILED', 'CANCELLED'].includes(payment.status)) {
            // Even an attempt the customer replaced (e.g. chose cash) is real money now.
            applied = await captureOrFlag(tx, booking, payment, p.id, now)
          }
        } else if (payment.status === 'PENDING') {
          await tx
            .update(payments)
            .set({
              status: 'FAILED',
              failureReason: (p.error_description ?? 'The payment did not go through').slice(
                0,
                300,
              ),
              version: payment.version + 1,
            })
            .where(eq(payments.id, payment.id))
          applied = true
        }
      }
    } else if ((parsed.event === 'refund.processed' || parsed.event === 'refund.failed') && r) {
      // By Razorpay's id, or by our id in the notes when the webhook beat us to saving it.
      const ours = refundIdFromNotes(r.notes)
      const [refund] = await tx
        .select({ id: refunds.id, status: refunds.status })
        .from(refunds)
        .where(
          ours
            ? or(eq(refunds.providerRefundId, r.id), eq(refunds.id, ours))
            : eq(refunds.providerRefundId, r.id),
        )
        .for('update')
      if (refund && refund.status === 'REQUESTED') {
        await tx.update(refunds).set({ providerRefundId: r.id }).where(eq(refunds.id, refund.id))
        if (parsed.event === 'refund.processed') {
          await tx.update(refunds).set({ status: 'PROCESSED' }).where(eq(refunds.id, refund.id))
        } else {
          await failRefund(tx, refund.id)
        }
        applied = true
      }
    }
    await tx.update(paymentEvents).set({ processedAt: now }).where(eq(paymentEvents.id, stored.id))
    return { status: applied ? 'processed' : 'ignored', event: parsed.event }
  })
}
