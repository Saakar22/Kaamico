import 'server-only'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { AppError, notFound } from '@/lib/errors'
import { fromIst, istDateKey } from '@/lib/time'
import { earliestStart, freeStarts } from '@/modules/availability/slots'
import type { PricingUnit } from '@/modules/catalog/units'
import { matchingConfig as config } from '@/modules/matching/config'
import { loadSchedules } from '@/modules/matching/repo'
import { photoUrl } from '@/modules/uploads/serve'
import { isNewWorker } from '@/modules/matching/scoring'
import type { Locale } from '@/i18n/config'
import { localized } from '@/modules/catalog/catalog'

/**
 * Public projection of a professional. Deliberately excludes phone, base location,
 * documents and internal counters (IMPLEMENTATION_PLAN.md §10.3).
 */
export type PublicProfile = {
  workerId: string
  displayName: string
  photoUrl: string | null
  bio: string | null
  yearsExperience: number
  languages: string[]
  city: string | null
  rating: { avg: number | null; count: number }
  completedJobs: number
  isNew: boolean
  /** When an admin approved their ID (shown as "ID checked by Kaamico on …"). */
  verifiedOn: string | null
  memberSince: string
  categories: { slug: string; name: string }[]
  services: {
    serviceId: string
    name: string
    category: { slug: string; name: string }
    pricePaise: number
    minChargePaise: number
    unit: PricingUnit
    negotiable: boolean
    typicalDurationMin: number
  }[]
}

export type PublicReview = {
  id: string
  rating: number
  tags: string[]
  comment: string | null
  /** First name and last initial, e.g. "Priya S." */
  author: string
  serviceName: string
  createdAt: string
  workerReply: string | null
}

export type ReviewPage = {
  /** Count of published reviews per star, 5 → 1. */
  histogram: Record<1 | 2 | 3 | 4 | 5, number>
  items: PublicReview[]
  nextCursor: string | null
}

const isUuid = (value: string) => z.uuid().safeParse(value).success

const parseArray = (value: string[] | string): string[] =>
  Array.isArray(value) ? value : value.replace(/[{}]/g, '').split(',').filter(Boolean)

/** A worker is public only while VERIFIED with an active account. Anything else is a 404. */
export const PUBLIC_WORKER = sql`
  w.verification_status = 'VERIFIED' and u.status = 'ACTIVE' and u.deleted_at is null`

export async function assertPublic(workerId: string): Promise<void> {
  if (!isUuid(workerId)) throw notFound('Professional not found')
  const rows = await getDb().execute(sql`
    select 1 from worker_profiles w join users u on u.id = w.user_id
    where w.id = ${workerId} and ${PUBLIC_WORKER}`)
  if (rows.length === 0) throw notFound('Professional not found')
}

export async function getPublicProfile(
  workerId: string,
  locale: Locale = 'en',
): Promise<PublicProfile> {
  if (!isUuid(workerId)) throw notFound('Professional not found')
  const db = getDb()
  const [w] = await db.execute<{
    id: string
    display_name: string
    photo_key: string | null
    bio: string | null
    years_experience: number
    languages: string[] | string
    rating_sum: number
    rating_count: number
    completed_jobs: number
    created_at: Date | string
    city: string | null
    verified_on: Date | string | null
  }>(sql`
    select w.id, w.display_name, w.photo_key, w.bio, w.years_experience, w.languages, w.rating_sum,
           w.rating_count, w.completed_jobs, w.created_at, l.city,
           (select max(a.reviewed_at) from verification_applications a
             where a.worker_id = w.id and a.status = 'APPROVED') as verified_on
    from worker_profiles w
    join users u on u.id = w.user_id
    left join localities l on l.id = w.base_locality_id
    where w.id = ${workerId} and ${PUBLIC_WORKER}`)
  if (!w) throw notFound('Professional not found')

  const [categories, services] = await Promise.all([
    db.execute<{ slug: string; name: string }>(sql`
      select c.slug, ${localized(locale, 'c', 'name')} as name from worker_skills ws
      join service_categories c on c.id = ws.category_id and c.is_active
      where ws.worker_id = ${workerId} order by c.sort_order`),
    db.execute<{
      service_id: string
      name: string
      category_slug: string
      category_name: string
      price_paise: number
      min_charge_paise: number
      unit: PricingUnit
      is_negotiable: boolean
      typical_duration_min: number
    }>(sql`
      select s.id as service_id, ${localized(locale, 's', 'name')} as name, c.slug as category_slug,
             ${localized(locale, 'c', 'name')} as category_name,
             p.price_paise, p.min_charge_paise, p.unit, p.is_negotiable, s.typical_duration_min
      from worker_service_pricing p
      join services s on s.id = p.service_id and s.is_active
      join service_categories c on c.id = s.category_id and c.is_active
      where p.worker_id = ${workerId} and p.is_active
        and exists (select 1 from worker_skills ws where ws.worker_id = p.worker_id and ws.category_id = c.id)
      order by c.sort_order, s.name`),
  ])

  return {
    workerId: w.id,
    displayName: w.display_name,
    photoUrl: photoUrl(w.id, w.photo_key),
    bio: w.bio,
    yearsExperience: w.years_experience,
    languages: parseArray(w.languages),
    city: w.city,
    rating: {
      avg: w.rating_count > 0 ? Math.round((w.rating_sum / w.rating_count) * 10) / 10 : null,
      count: w.rating_count,
    },
    completedJobs: w.completed_jobs,
    isNew: isNewWorker(w.completed_jobs),
    verifiedOn: w.verified_on ? new Date(w.verified_on).toISOString() : null,
    memberSince: new Date(w.created_at).toISOString(),
    categories: [...categories],
    services: services.map((s) => ({
      serviceId: s.service_id,
      name: s.name,
      category: { slug: s.category_slug, name: s.category_name },
      pricePaise: s.price_paise,
      minChargePaise: s.min_charge_paise,
      unit: s.unit,
      negotiable: s.is_negotiable,
      typicalDurationMin: s.typical_duration_min,
    })),
  }
}

export const reviewsQuerySchema = z.object({
  cursor: z
    .string()
    .regex(/^\d{1,5}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

function authorName(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Kaamico customer'
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`
}

/** Visible reviews (published, or reported and awaiting a check), newest first, with a star histogram. */
export async function getPublicReviews(
  workerId: string,
  query: z.input<typeof reviewsQuerySchema> = {},
  locale: Locale = 'en',
): Promise<ReviewPage> {
  const { cursor, limit } = reviewsQuerySchema.parse(query)
  await assertPublic(workerId)
  const offset = cursor ? Number(cursor) : 0
  const db = getDb()
  const [counts, rows] = await Promise.all([
    db.execute<{ rating: number; n: number }>(sql`
      select rating, count(*)::int as n from reviews
      where worker_id = ${workerId} and status <> 'HIDDEN' group by rating`),
    db.execute<{
      id: string
      rating: number
      tags: string[] | string
      comment: string | null
      author: string | null
      service_name: string
      created_at: Date | string
      worker_reply: string | null
    }>(sql`
      select r.id, r.rating, r.tags, r.comment, u.name as author,
             ${localized(locale, 's', 'name')} as service_name,
             r.created_at, r.worker_reply
      from reviews r
      join users u on u.id = r.customer_id
      join bookings b on b.id = r.booking_id
      join services s on s.id = b.service_id
      where r.worker_id = ${workerId} and r.status <> 'HIDDEN'
      order by r.created_at desc, r.id desc
      limit ${limit + 1} offset ${offset}`),
  ])
  const histogram: ReviewPage['histogram'] = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  for (const c of counts) histogram[c.rating as 1 | 2 | 3 | 4 | 5] = c.n
  return {
    histogram,
    items: rows.slice(0, limit).map((r) => ({
      id: r.id,
      rating: r.rating,
      tags: parseArray(r.tags),
      comment: r.comment,
      author: authorName(r.author),
      serviceName: r.service_name,
      createdAt: new Date(r.created_at).toISOString(),
      workerReply: r.worker_reply,
    })),
    nextCursor: rows.length > limit ? String(offset + limit) : null,
  }
}

export const availabilityQuerySchema = z.object({
  serviceId: z.uuid().optional(),
  /** IST calendar date, YYYY-MM-DD. Defaults to today. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

export type FreeSlot = { start: string; end: string }

/** Free start times on a 30-minute grid for one IST day (within hours, minus bookings and time off). */
export async function getAvailability(
  workerId: string,
  query: z.input<typeof availabilityQuerySchema>,
  now: Date = new Date(),
): Promise<{ date: string; durationMin: number; slots: FreeSlot[] }> {
  const { serviceId, date = istDateKey(now) } = availabilityQuerySchema.parse(query)
  await assertPublic(workerId)
  let durationMin = 60
  if (serviceId) {
    const [svc] = await getDb().execute<{ typical_duration_min: number }>(sql`
      select s.typical_duration_min from services s
      join worker_service_pricing p on p.service_id = s.id and p.worker_id = ${workerId} and p.is_active
      where s.id = ${serviceId} and s.is_active`)
    if (!svc) throw notFound('This professional does not offer that service')
    durationMin = svc.typical_duration_min
  }
  const [y, m, d] = date.split('-').map(Number)
  const dayStart = fromIst(y, m, d)
  if (istDateKey(dayStart) !== date) throw new AppError('VALIDATION_FAILED', 'Invalid date')
  const dayEnd = fromIst(y, m, d + 1)
  const { leadMinutes, gridMinutes, maxAheadDays } = config.scheduling
  const earliest = earliestStart(now, leadMinutes, gridMinutes)
  const latest = new Date(now.getTime() + maxAheadDays * 24 * 60 * 60_000)
  const from = new Date(Math.max(dayStart.getTime(), earliest.getTime()))
  const until = new Date(Math.min(dayEnd.getTime(), latest.getTime()))
  if (until <= from) return { date, durationMin, slots: [] }

  const schedule = (
    await loadSchedules(
      [workerId],
      from,
      new Date(until.getTime() + (durationMin + config.bufferMinutes) * 60_000),
    )
  ).get(workerId)!
  const slots = [
    ...freeStarts({
      ...schedule,
      durationMin,
      bufferMin: config.bufferMinutes,
      gridMin: gridMinutes,
      from,
      until,
    }),
  ].map((start) => ({
    start: start.toISOString(),
    end: new Date(start.getTime() + durationMin * 60_000).toISOString(),
  }))
  return { date, durationMin, slots }
}
