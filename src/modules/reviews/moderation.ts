import 'server-only'
import { eq, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { reviews, workerProfiles } from '@/db/schema'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { enforceRateLimit } from '@/lib/rate-limit'
import { writeAudit, type AuditContext } from '@/modules/audit/audit'
import type { Actor } from '@/modules/auth/types'
import { addOutbox, type Tx } from '@/modules/bookings/repo'
import type { Locale } from '@/i18n/config'
import { localized } from '@/modules/catalog/catalog'

/**
 * Review replies, reports and moderation (IMPLEMENTATION_PLAN.md §10.10, §10.15).
 * A reported review stays public (FLAGGED) until an admin hides it. Rating totals on
 * the professional count published and reported reviews, never hidden ones.
 */

const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null)
const parseArray = (v: string[] | string | null) =>
  Array.isArray(v) ? v : (v ?? '').replace(/[{}"]/g, '').split(',').filter(Boolean)

export const replyInput = z.object({
  reply: z.string().trim().min(2, 'Write a short reply').max(500),
})

export const reportInput = z.object({
  reason: z.string().trim().min(10, 'Tell us what is wrong (at least 10 characters)').max(300),
})

export const moderationInput = z.object({
  action: z.enum(['HIDE', 'RESTORE']),
  reason: z.string().trim().min(10, 'Give a reason (at least 10 characters)').max(300),
})

async function lockReview(tx: Tx, reviewId: string) {
  if (!z.uuid().safeParse(reviewId).success) throw notFound('Review not found')
  const [review] = await tx.select().from(reviews).where(eq(reviews.id, reviewId)).for('update')
  if (!review) throw notFound('Review not found')
  return review
}

/** Moves a professional's rating totals by one review. */
async function adjustRating(tx: Tx, workerId: string, rating: number, direction: 1 | -1) {
  await tx
    .update(workerProfiles)
    .set({
      ratingSum: sql`${workerProfiles.ratingSum} + ${rating * direction}`,
      ratingCount: sql`${workerProfiles.ratingCount} + ${direction}`,
    })
    .where(eq(workerProfiles.id, workerId))
}

/** The reviewed professional answers once, publicly. */
export async function replyToReview(
  actor: Actor,
  reviewId: string,
  raw: unknown,
  now = new Date(),
) {
  const input = replyInput.parse(raw)
  return getDb().transaction(async (tx) => {
    const review = await lockReview(tx, reviewId)
    if (!actor.workerId || review.workerId !== actor.workerId) throw notFound('Review not found')
    if (review.workerReply) throw conflict('ALREADY_REPLIED', 'You have already replied')
    if (review.status === 'HIDDEN') {
      throw conflict('REVIEW_HIDDEN', 'This review has been hidden by Kaamico')
    }
    await tx
      .update(reviews)
      .set({ workerReply: input.reply, replyAt: now })
      .where(eq(reviews.id, review.id))
    await addOutbox(tx, 'review.replied', { bookingId: review.bookingId, reviewId: review.id })
    return { reviewId: review.id, reply: input.reply, replyAt: now.toISOString() }
  })
}

/** The professional or the customer asks Kaamico to look at a review. */
export async function reportReview(actor: Actor, reviewId: string, raw: unknown, now = new Date()) {
  const input = reportInput.parse(raw)
  await enforceRateLimit(
    `review-reports:user:${actor.userId}`,
    { limit: 10, windowSeconds: 24 * 3600 },
    'Too many reports today. Please contact support.',
  )
  return getDb().transaction(async (tx) => {
    const review = await lockReview(tx, reviewId)
    const involved = review.customerId === actor.userId || review.workerId === actor.workerId
    if (!involved) throw notFound('Review not found')
    if (review.status !== 'PUBLISHED') {
      throw conflict(
        'ALREADY_REPORTED',
        review.status === 'HIDDEN'
          ? 'This review has already been hidden'
          : 'This review is already waiting for Kaamico to check it',
      )
    }
    await tx
      .update(reviews)
      .set({
        status: 'FLAGGED',
        flagReason: input.reason,
        flaggedAt: now,
        flaggedByUserId: actor.userId,
      })
      .where(eq(reviews.id, review.id))
    return { reviewId: review.id, status: 'FLAGGED' as const }
  })
}

export type WorkerReviewView = {
  id: string
  rating: number
  tags: string[]
  comment: string | null
  author: string
  serviceName: string
  bookingCode: string
  status: 'PUBLISHED' | 'FLAGGED' | 'HIDDEN'
  hiddenReason: string | null
  reply: string | null
  createdAt: string
}

/** Every review of the signed-in professional, newest first (hidden ones say so). */
export async function listWorkerReviews(
  actor: Actor,
  limit = 50,
  locale: Locale = 'en',
): Promise<WorkerReviewView[]> {
  if (!actor.workerId) throw forbidden('Only professionals have reviews')
  const rows = await getDb().execute<{
    id: string
    rating: number
    tags: string[] | string
    comment: string | null
    author: string | null
    service_name: string
    code: string
    status: WorkerReviewView['status']
    hidden_reason: string | null
    worker_reply: string | null
    created_at: Date | string
  }>(sql`
    select r.id, r.rating, r.tags, r.comment, u.name as author,
           ${localized(locale, 's', 'name')} as service_name, b.code,
           r.status, r.hidden_reason, r.worker_reply, r.created_at
    from reviews r
    join users u on u.id = r.customer_id
    join bookings b on b.id = r.booking_id
    join services s on s.id = b.service_id
    where r.worker_id = ${actor.workerId}
    order by r.created_at desc, r.id desc
    limit ${limit}`)
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    tags: parseArray(r.tags),
    comment: r.comment,
    author: (r.author ?? 'Customer').trim().split(/\s+/)[0],
    serviceName: r.service_name,
    bookingCode: r.code,
    status: r.status,
    hiddenReason: r.hidden_reason,
    reply: r.worker_reply,
    createdAt: iso(r.created_at)!,
  }))
}

export const adminReviewQuery = z.object({
  status: z.enum(['FLAGGED', 'HIDDEN', 'PUBLISHED', 'ALL']).default('FLAGGED'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
})

export type AdminReviewItem = {
  id: string
  rating: number
  comment: string | null
  tags: string[]
  status: WorkerReviewView['status']
  reply: string | null
  flagReason: string | null
  flaggedAt: string | null
  flaggedBy: 'CUSTOMER' | 'WORKER' | null
  hiddenReason: string | null
  customerName: string | null
  worker: { id: string; name: string }
  booking: { id: string; code: string }
  createdAt: string
}

const PAGE = 25

/** Reported reviews first and oldest report first, so the queue is worked in order. */
export async function listAdminReviews(
  raw: unknown,
): Promise<{ items: AdminReviewItem[]; page: number; hasMore: boolean }> {
  const q = adminReviewQuery.parse(raw)
  const filter: SQL = q.status === 'ALL' ? sql`true` : sql`r.status = ${q.status}`
  const order =
    q.status === 'FLAGGED' ? sql`r.flagged_at asc, r.id` : sql`r.created_at desc, r.id desc`
  const rows = await getDb().execute<{
    id: string
    rating: number
    comment: string | null
    tags: string[] | string
    status: WorkerReviewView['status']
    worker_reply: string | null
    flag_reason: string | null
    flagged_at: Date | string | null
    flagged_by_user_id: string | null
    customer_id: string
    hidden_reason: string | null
    customer_name: string | null
    worker_id: string
    worker_name: string
    booking_id: string
    code: string
    created_at: Date | string
  }>(sql`
    select r.id, r.rating, r.comment, r.tags, r.status, r.worker_reply, r.flag_reason,
           r.flagged_at, r.flagged_by_user_id, r.customer_id, r.hidden_reason,
           u.name as customer_name, w.id as worker_id, w.display_name as worker_name,
           b.id as booking_id, b.code, r.created_at
    from reviews r
    join users u on u.id = r.customer_id
    join worker_profiles w on w.id = r.worker_id
    join bookings b on b.id = r.booking_id
    where ${filter}
    order by ${order}
    limit ${PAGE + 1} offset ${(q.page - 1) * PAGE}`)
  return {
    items: rows.slice(0, PAGE).map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      tags: parseArray(r.tags),
      status: r.status,
      reply: r.worker_reply,
      flagReason: r.flag_reason,
      flaggedAt: iso(r.flagged_at),
      flaggedBy: r.flagged_by_user_id
        ? r.flagged_by_user_id === r.customer_id
          ? 'CUSTOMER'
          : 'WORKER'
        : null,
      hiddenReason: r.hidden_reason,
      customerName: r.customer_name,
      worker: { id: r.worker_id, name: r.worker_name },
      booking: { id: r.booking_id, code: r.code },
      createdAt: iso(r.created_at)!,
    })),
    page: q.page,
    hasMore: rows.length > PAGE,
  }
}

/**
 * Hides a review (from the public profile and the rating) or restores it. Restoring a
 * reported review dismisses the report. Audited in the same transaction.
 */
export async function moderateReview(
  admin: Actor,
  reviewId: string,
  raw: unknown,
  context: AuditContext,
) {
  const input = moderationInput.parse(raw)
  return getDb().transaction(async (tx) => {
    const review = await lockReview(tx, reviewId)
    const to = input.action === 'HIDE' ? 'HIDDEN' : 'PUBLISHED'
    if (review.status === to) {
      throw conflict(
        'NO_CHANGE',
        to === 'HIDDEN' ? 'This review is already hidden' : 'This review is already published',
      )
    }
    await tx
      .update(reviews)
      .set({ status: to, hiddenReason: to === 'HIDDEN' ? input.reason : null })
      .where(eq(reviews.id, review.id))
    if (to === 'HIDDEN') await adjustRating(tx, review.workerId, review.rating, -1)
    else if (review.status === 'HIDDEN') await adjustRating(tx, review.workerId, review.rating, 1)
    await writeAudit(tx, admin, context, {
      action: to === 'HIDDEN' ? 'REVIEW_HIDDEN' : 'REVIEW_RESTORED',
      entityType: 'review',
      entityId: review.id,
      before: { status: review.status, flagReason: review.flagReason },
      after: { status: to },
      reason: input.reason,
    })
    return { reviewId: review.id, status: to }
  })
}
