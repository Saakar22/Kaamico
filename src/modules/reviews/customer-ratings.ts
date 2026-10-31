import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { customerProfiles, customerRatings } from '@/db/schema'
import { businessRule, conflict, notFound, pgErrorCode } from '@/lib/errors'
import type { Actor } from '@/modules/auth/types'
import { lockBooking } from '@/modules/bookings/repo'
import { REVIEW_WINDOW_DAYS } from './reviews'

const DAY = 86_400_000

/**
 * A customer's average appears only once this many professionals have rated them, so
 * no single rating can be worked out from it.
 */
export const CUSTOMER_RATING_MIN_COUNT = 3

/** Quick facts a professional can add about a customer (never shown to anyone else as-is). */
export const CUSTOMER_TAG_LABELS = {
  ready_on_time: { en: 'Ready on time', hi: 'समय पर तैयार' },
  clear_instructions: { en: 'Clear about the job', hi: 'काम साफ़ बताया' },
  respectful: { en: 'Respectful', hi: 'सम्मान से पेश आए' },
  paid_promptly: { en: 'Paid promptly', hi: 'समय पर भुगतान' },
  safe_place: { en: 'Safe place to work', hi: 'काम की जगह सुरक्षित' },
} as const

export type CustomerTag = keyof typeof CUSTOMER_TAG_LABELS
export const CUSTOMER_TAGS = Object.keys(CUSTOMER_TAG_LABELS) as CustomerTag[]

export const customerRatingInput = z.object({
  rating: z.number().int().min(1, 'Choose 1 to 5 stars').max(5),
  tags: z
    .array(z.enum(CUSTOMER_TAGS as [CustomerTag, ...CustomerTag[]]))
    .max(CUSTOMER_TAGS.length)
    .default([])
    .transform((t) => [...new Set(t)]),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
})

export type CustomerRatingSummary = { avg: number; count: number } | null

/** The average, or null while too few professionals have rated the customer. */
export function customerRatingSummary(sum: number, count: number): CustomerRatingSummary {
  if (count < CUSTOMER_RATING_MIN_COUNT) return null
  return { avg: Math.round((sum / count) * 10) / 10, count }
}

/** Whether the assigned professional can rate this booking's customer now, and their rating. */
export async function customerRatingState(
  actor: Actor,
  bookingId: string,
  now: Date = new Date(),
): Promise<{ rating: number | null; canRate: boolean }> {
  if (!actor.workerId || !z.uuid().safeParse(bookingId).success) throw notFound('Job not found')
  const [row] = await getDb().execute<{
    status: string
    worker_id: string | null
    completed_at: Date | string | null
    rating: number | null
  }>(sql`
    select b.status, b.worker_id, b.completed_at, r.rating
    from bookings b left join customer_ratings r on r.booking_id = b.id
    where b.id = ${bookingId}`)
  if (!row || row.worker_id !== actor.workerId) throw notFound('Job not found')
  const open =
    row.status === 'COMPLETED' &&
    row.completed_at !== null &&
    now.getTime() <= new Date(row.completed_at).getTime() + REVIEW_WINDOW_DAYS * DAY
  return { rating: row.rating, canRate: row.rating === null && open }
}

/**
 * One private rating per completed booking, by its professional, within 14 days. The
 * customer's totals change in the same transaction; a database trigger re-checks the rules.
 */
export async function rateCustomer(
  actor: Actor,
  bookingId: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<{ rating: number }> {
  const input = customerRatingInput.parse(raw)
  if (!actor.workerId || !z.uuid().safeParse(bookingId).success) throw notFound('Job not found')
  return getDb().transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId)
    if (booking.workerId !== actor.workerId) throw notFound('Job not found')
    if (booking.status !== 'COMPLETED' || !booking.completedAt) {
      throw businessRule('NOT_REVIEWABLE', 'You can rate the customer once the job is completed')
    }
    if (now.getTime() > booking.completedAt.getTime() + REVIEW_WINDOW_DAYS * DAY) {
      throw businessRule(
        'REVIEW_WINDOW_CLOSED',
        `Ratings can be given up to ${REVIEW_WINDOW_DAYS} days after the job`,
      )
    }
    try {
      await tx.insert(customerRatings).values({
        bookingId: booking.id,
        workerId: actor.workerId!,
        customerId: booking.customerId,
        rating: input.rating,
        tags: input.tags,
        note: input.note,
        createdAt: now,
      })
    } catch (error) {
      if (pgErrorCode(error) === '23505') {
        throw conflict('ALREADY_REVIEWED', 'You have already rated this customer for this job')
      }
      throw error
    }
    await tx
      .insert(customerProfiles)
      .values({ userId: booking.customerId, ratingSum: input.rating, ratingCount: 1 })
      .onConflictDoUpdate({
        target: customerProfiles.userId,
        set: {
          ratingSum: sql`${customerProfiles.ratingSum} + ${input.rating}`,
          ratingCount: sql`${customerProfiles.ratingCount} + 1`,
        },
      })
    return { rating: input.rating }
  })
}

/** The customer's own average (shown on their account page), or null while too few. */
export async function ownCustomerRating(userId: string): Promise<CustomerRatingSummary> {
  const [row] = await getDb()
    .select({ sum: customerProfiles.ratingSum, count: customerProfiles.ratingCount })
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, userId))
  return row ? customerRatingSummary(row.sum, row.count) : null
}
