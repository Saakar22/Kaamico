import 'server-only'
import { sql, type SQL } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { ACTIVE_BOOKING_STATUSES } from '@/db/schema'
import type { PricingUnit } from '@/modules/catalog/units'
import type { Busy, WeeklyRule } from '@/modules/availability/slots'
import { notBlockedBy } from '@/modules/favorites/blocks'
import { matchingConfig as config } from './config'

/** When the customer needs the job done. */
export type Timing =
  | { kind: 'now' }
  /** A scheduled start; `weekday`/`startMinute` are its IST wall-clock values. */
  | { kind: 'at'; start: Date; weekday: number; startMinute: number }
  /** No time given: anyone with upcoming hours or online now. */
  | { kind: 'flexible' }

export type CandidateRow = {
  workerId: string
  displayName: string
  photoKey: string | null
  yearsExperience: number
  languages: string[]
  ratingSum: number
  ratingCount: number
  completedJobs: number
  acceptedInvitations: number
  totalInvitations: number
  cancellationsByWorker: number
  pricePaise: number
  minChargePaise: number
  unit: PricingUnit
  isNegotiable: boolean
  distanceKm: number
  availableNow: boolean
}

const ACTIVE = sql.raw(`(${ACTIVE_BOOKING_STATUSES.map((s) => `'${s}'`).join(',')})`)
const ts = (date: Date) => sql`${date.toISOString()}::timestamptz`

/** Worker and account are in good standing (alias w = worker_profiles, u = users). */
const eligibleWorker = (now: Date) => sql`
  w.verification_status = 'VERIFIED'
  and u.status = 'ACTIVE' and u.deleted_at is null
  and (w.paused_until is null or w.paused_until <= ${ts(now)})`

/** Within `radiusKm` of the point and within the worker's own travel radius. */
function withinReach(lat: number, lng: number, radiusKm: number): SQL {
  // Bounding box first so the B-tree index on (base_lat, base_lng) can narrow the scan.
  const dLat = radiusKm / 111.32
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))
  return sql`
    w.base_lat between ${lat - dLat} and ${lat + dLat}
    and w.base_lng between ${lng - dLng} and ${lng + dLng}
    and kaamico_haversine_km(${lat}, ${lng}, w.base_lat, w.base_lng) <= least(${radiusKm}, w.service_radius_km)`
}

/** No active booking or time off overlapping [start, end). */
const freeBetween = (start: Date, end: Date) => sql`
  not exists (
    select 1 from bookings b
    where b.worker_id = w.id and b.status in ${ACTIVE}
      and b.slot && tstzrange(${ts(start)}, ${ts(end)})
  )
  and not exists (
    select 1 from worker_time_off t
    where t.worker_id = w.id and t.period && tstzrange(${ts(start)}, ${ts(end)})
  )`

const minutes = (date: Date, m: number) => new Date(date.getTime() + m * 60_000)

/** Online, recently active, and free for the whole job right now. */
function availableNowSql(now: Date, durationMin: number): SQL {
  return sql`(
    w.is_online
    and w.last_active_at > ${ts(minutes(now, -config.onlineFreshMinutes))}
    and ${freeBetween(now, minutes(now, durationMin + config.bufferMinutes))}
  )`
}

function timingFilter(timing: Timing, now: Date, durationMin: number): SQL {
  switch (timing.kind) {
    case 'now':
      return availableNowSql(now, durationMin)
    case 'at': {
      const end = timing.startMinute + durationMin
      return sql`
        exists (
          select 1 from worker_availability_rules r
          where r.worker_id = w.id and r.weekday = ${timing.weekday}
            and r.start_minute <= ${timing.startMinute} and r.end_minute >= ${end}
        )
        and ${freeBetween(timing.start, minutes(timing.start, durationMin + config.bufferMinutes))}`
    }
    case 'flexible':
      return sql`true`
  }
}

type RawCandidate = {
  worker_id: string
  display_name: string
  photo_key: string | null
  years_experience: number
  languages: string[] | string
  rating_sum: number
  rating_count: number
  completed_jobs: number
  accepted_invitations: number
  total_invitations: number
  cancellations_by_worker: number
  price_paise: number
  min_charge_paise: number
  unit: PricingUnit
  is_negotiable: boolean
  distance_km: number
  available_now: boolean
}

/** postgres.js returns varchar[] as an array, but tolerate the '{a,b}' text form. */
const parseArray = (value: string[] | string): string[] =>
  Array.isArray(value) ? value : value.replace(/[{}]/g, '').split(',').filter(Boolean)

/** Eligible candidates for one service within `radiusKm` (filters 1–5 of §11.1). */
export async function findCandidates(params: {
  serviceId: string
  lat: number
  lng: number
  radiusKm: number
  durationMin: number
  timing: Timing
  now: Date
  maxPricePaise?: number
  /** The searching customer: professionals they blocked are left out. */
  customerId?: string
}): Promise<CandidateRow[]> {
  const { serviceId, lat, lng, radiusKm, durationMin, timing, now } = params
  const rows = await getDb().execute<RawCandidate>(sql`
    select w.id as worker_id, w.display_name, w.photo_key, w.years_experience, w.languages,
           w.rating_sum, w.rating_count, w.completed_jobs, w.accepted_invitations,
           w.total_invitations, w.cancellations_by_worker,
           p.price_paise, p.min_charge_paise, p.unit, p.is_negotiable,
           kaamico_haversine_km(${lat}, ${lng}, w.base_lat, w.base_lng) as distance_km,
           ${availableNowSql(now, durationMin)} as available_now
    from worker_profiles w
    join users u on u.id = w.user_id
    join worker_service_pricing p on p.worker_id = w.id and p.service_id = ${serviceId} and p.is_active
    join services s on s.id = p.service_id and s.is_active
    join service_categories c on c.id = s.category_id and c.is_active
    where ${eligibleWorker(now)}
      and exists (select 1 from worker_skills ws where ws.worker_id = w.id and ws.category_id = s.category_id)
      and ${withinReach(lat, lng, radiusKm)}
      and ${timingFilter(timing, now, durationMin)}
      ${params.maxPricePaise ? sql`and p.price_paise <= ${params.maxPricePaise}` : sql``}
      ${params.customerId ? sql`and ${notBlockedBy(params.customerId)}` : sql``}`)
  return rows.map((r) => ({
    workerId: r.worker_id,
    displayName: r.display_name,
    photoKey: r.photo_key,
    yearsExperience: r.years_experience,
    languages: parseArray(r.languages),
    ratingSum: r.rating_sum,
    ratingCount: r.rating_count,
    completedJobs: r.completed_jobs,
    acceptedInvitations: r.accepted_invitations,
    totalInvitations: r.total_invitations,
    cancellationsByWorker: r.cancellations_by_worker,
    pricePaise: r.price_paise,
    minChargePaise: r.min_charge_paise,
    unit: r.unit,
    isNegotiable: r.is_negotiable,
    distanceKm: Number(r.distance_km),
    availableNow: r.available_now,
  }))
}

export type Schedule = { rules: WeeklyRule[]; busy: Busy[] }

/** Weekly hours plus bookings and time off overlapping [from, until), per worker. */
export async function loadSchedules(
  workerIds: readonly string[],
  from: Date,
  until: Date,
): Promise<Map<string, Schedule>> {
  const schedules = new Map<string, Schedule>(workerIds.map((id) => [id, { rules: [], busy: [] }]))
  if (workerIds.length === 0) return schedules
  const db = getDb()
  const ids = sql`array[${sql.join(
    workerIds.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`
  const [rules, busy] = await Promise.all([
    db.execute<{ worker_id: string; weekday: number; start_minute: number; end_minute: number }>(
      sql`select worker_id, weekday, start_minute, end_minute
          from worker_availability_rules where worker_id = any(${ids})`,
    ),
    db.execute<{ worker_id: string; start_at: Date | string; end_at: Date | string }>(sql`
      select worker_id, lower(slot) as start_at, upper(slot) as end_at from bookings
      where worker_id = any(${ids}) and status in ${ACTIVE}
        and slot && tstzrange(${ts(from)}, ${ts(until)})
      union all
      select worker_id, lower(period), upper(period) from worker_time_off
      where worker_id = any(${ids}) and period && tstzrange(${ts(from)}, ${ts(until)})`),
  ])
  for (const r of rules) {
    schedules.get(r.worker_id)?.rules.push({
      weekday: r.weekday,
      startMinute: r.start_minute,
      endMinute: r.end_minute,
    })
  }
  for (const b of busy) {
    schedules.get(b.worker_id)?.busy.push({ start: new Date(b.start_at), end: new Date(b.end_at) })
  }
  return schedules
}

export type PriceRange = {
  serviceId: string
  minPaise: number
  medianPaise: number
  maxPaise: number
  workerCount: number
}

/**
 * Real price ranges per service from eligible workers who would travel to the point.
 * Services with fewer than `minWorkers` prices are omitted (privacy and noise).
 */
export async function nearbyPriceRanges(params: {
  categoryId: string
  lat: number
  lng: number
  now: Date
}): Promise<Map<string, PriceRange>> {
  const { radiusKm, minWorkers } = config.nearbyPrices
  const rows = await getDb().execute<{
    service_id: string
    min_paise: number
    median_paise: number
    max_paise: number
    worker_count: number
  }>(sql`
    select p.service_id,
           min(p.price_paise)::int as min_paise,
           round(percentile_cont(0.5) within group (order by p.price_paise))::int as median_paise,
           max(p.price_paise)::int as max_paise,
           count(*)::int as worker_count
    from worker_profiles w
    join users u on u.id = w.user_id
    join worker_service_pricing p on p.worker_id = w.id and p.is_active
    join services s on s.id = p.service_id and s.is_active and s.category_id = ${params.categoryId}
    where ${eligibleWorker(params.now)}
      and exists (select 1 from worker_skills ws where ws.worker_id = w.id and ws.category_id = s.category_id)
      and ${withinReach(params.lat, params.lng, radiusKm)}
    group by p.service_id
    having count(*) >= ${minWorkers}`)
  return new Map(
    rows.map((r) => [
      r.service_id,
      {
        serviceId: r.service_id,
        minPaise: r.min_paise,
        medianPaise: r.median_paise,
        maxPaise: r.max_paise,
        workerCount: r.worker_count,
      },
    ]),
  )
}
