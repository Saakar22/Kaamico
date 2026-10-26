import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { reviews, workerProfiles } from '@/db/schema'
import { businessRule, conflict, notFound, pgErrorCode } from '@/lib/errors'
import type { Actor } from '@/modules/auth/types'
import { addOutbox, lockBooking } from '@/modules/bookings/repo'
import { REVIEW_TAGS } from './tags'

/** Customers can review a job for this long after it is completed. */
export const REVIEW_WINDOW_DAYS = 14
const DAY = 86_400_000

export const reviewInput = z.object({
  rating: z.number().int().min(1, 'Choose 1 to 5 stars').max(5),
  tags: z
    .array(z.enum(REVIEW_TAGS as [string, ...string[]]))
    .max(REVIEW_TAGS.length)
    .default([])
    .transform((t) => [...new Set(t)]),
  comment: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || null),
})

export type ReviewView = {
  id: string
  rating: number
  tags: string[]
  comment: string | null
  createdAt: string
}

/** Whether the customer can review this booking now, and their review if they did. */
export async function reviewState(
  actor: Actor,
  bookingId: string,
  now: Date = new Date(),
): Promise<{ review: ReviewView | null; canReview: boolean; closesAt: string | null }> {
  if (!z.uuid().safeParse(bookingId).success) throw notFound('Booking not found')
  const [row] = await getDb().execute<{
    status: string
    customer_id: string
    completed_at: Date | string | null
    review_id: string | null
    rating: number | null
    tags: string[] | null
    comment: string | null
    created_at: Date | string | null
  }>(sql`
    select b.status, b.customer_id, b.completed_at, r.id as review_id, r.rating, r.tags,
           r.comment, r.created_at
    from bookings b left join reviews r on r.booking_id = b.id
    where b.id = ${bookingId}`)
  if (!row || row.customer_id !== actor.userId) throw notFound('Booking not found')
  const closes = row.completed_at
    ? new Date(new Date(row.completed_at).getTime() + REVIEW_WINDOW_DAYS * DAY)
    : null
  return {
    review: row.review_id
      ? {
          id: row.review_id,
          rating: row.rating!,
          tags: row.tags ?? [],
          comment: row.comment,
          createdAt: new Date(row.created_at!).toISOString(),
        }
      : null,
    canReview: !row.review_id && row.status === 'COMPLETED' && closes !== null && now < closes,
    closesAt: closes?.toISOString() ?? null,
  }
}

/**
 * One review per completed booking, by its customer, within 14 days (§10.10). The
 * professional's rating totals change in the same transaction; a database trigger
 * re-checks every rule.
 */
export async function createReview(
  actor: Actor,
  bookingId: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<{ review: ReviewView }> {
  const input = reviewInput.parse(raw)
  if (!z.uuid().safeParse(bookingId).success) throw notFound('Booking not found')
  return getDb().transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId)
    if (booking.customerId !== actor.userId) throw notFound('Booking not found')
    if (booking.status !== 'COMPLETED' || !booking.completedAt || !booking.workerId) {
      throw businessRule('NOT_REVIEWABLE', 'You can review a job once it is completed')
    }
    if (now.getTime() > booking.completedAt.getTime() + REVIEW_WINDOW_DAYS * DAY) {
      throw businessRule(
        'REVIEW_WINDOW_CLOSED',
        `Reviews can be left up to ${REVIEW_WINDOW_DAYS} days after the job`,
      )
    }
    let created
    try {
      ;[created] = await tx
        .insert(reviews)
        .values({
          bookingId: booking.id,
          customerId: actor.userId,
          workerId: booking.workerId,
          rating: input.rating,
          tags: input.tags,
          comment: input.comment,
          createdAt: now,
        })
        .returning()
    } catch (error) {
      if (pgErrorCode(error) === '23505') {
        throw conflict('ALREADY_REVIEWED', 'You have already reviewed this job')
      }
      throw error
    }
    await tx
      .update(workerProfiles)
      .set({
        ratingSum: sql`${workerProfiles.ratingSum} + ${input.rating}`,
        ratingCount: sql`${workerProfiles.ratingCount} + 1`,
      })
      .where(eq(workerProfiles.id, booking.workerId))
    await addOutbox(tx, 'review.created', { bookingId: booking.id, rating: input.rating })
    return {
      review: {
        id: created.id,
        rating: created.rating,
        tags: created.tags,
        comment: created.comment,
        createdAt: created.createdAt.toISOString(),
      },
    }
  })
}
