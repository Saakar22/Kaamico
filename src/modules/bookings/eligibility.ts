import 'server-only'
import { sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { businessRule } from '@/lib/errors'
import { freeStarts, isSlotFree } from '@/modules/availability/slots'
import type { PricingUnit } from '@/modules/catalog/units'
import { matchingConfig } from '@/modules/matching/config'
import { loadSchedules } from '@/modules/matching/repo'
import type { Tx } from './repo'

export type LockedWorker = {
  workerId: string
  userId: string
  displayName: string
  baseLat: number
  baseLng: number
  radiusKm: number
  isOnline: boolean
  lastActiveAt: Date | null
  serviceId: string
  categoryId: string
  durationMin: number
  pricing: { pricePaise: number; minChargePaise: number; negotiable: boolean; unit: PricingUnit }
}

/**
 * Locks the worker row (serialising every confirmation for this worker) and checks they
 * can take this service right now: verified, active account, not paused, skill and an
 * active price. Anything else is 422 WORKER_UNAVAILABLE.
 */
export async function lockEligibleWorker(
  tx: Tx,
  workerId: string,
  serviceId: string,
  now: Date,
): Promise<LockedWorker> {
  await tx.execute(sql`select 1 from worker_profiles where id = ${workerId} for update`)
  const [row] = await tx.execute<{
    user_id: string
    display_name: string
    base_lat: number | null
    base_lng: number | null
    service_radius_km: number | string
    is_online: boolean
    last_active_at: Date | string | null
    category_id: string
    typical_duration_min: number
    price_paise: number
    min_charge_paise: number
    is_negotiable: boolean
    unit: PricingUnit
  }>(sql`
    select w.user_id, w.display_name, w.base_lat, w.base_lng, w.service_radius_km, w.is_online,
           w.last_active_at, s.category_id, s.typical_duration_min,
           p.price_paise, p.min_charge_paise, p.is_negotiable, p.unit
    from worker_profiles w
    join users u on u.id = w.user_id
    join worker_service_pricing p on p.worker_id = w.id and p.service_id = ${serviceId} and p.is_active
    join services s on s.id = p.service_id and s.is_active
    join service_categories c on c.id = s.category_id and c.is_active
    where w.id = ${workerId}
      and w.verification_status = 'VERIFIED'
      and u.status = 'ACTIVE' and u.deleted_at is null
      and (w.paused_until is null or w.paused_until <= ${now.toISOString()}::timestamptz)
      and w.base_lat is not null
      and exists (select 1 from worker_skills ws where ws.worker_id = w.id and ws.category_id = s.category_id)`)
  if (!row) {
    throw businessRule('WORKER_UNAVAILABLE', 'This professional is not taking this job right now')
  }
  return {
    workerId,
    userId: row.user_id,
    displayName: row.display_name,
    baseLat: Number(row.base_lat),
    baseLng: Number(row.base_lng),
    radiusKm: Number(row.service_radius_km),
    isOnline: row.is_online,
    lastActiveAt: row.last_active_at ? new Date(row.last_active_at) : null,
    serviceId,
    categoryId: row.category_id,
    durationMin: row.typical_duration_min,
    pricing: {
      pricePaise: row.price_paise,
      minChargePaise: row.min_charge_paise,
      negotiable: row.is_negotiable,
      unit: row.unit,
    },
  }
}

const MINUTE = 60_000

/** The time a confirmed job blocks: start .. start + duration + travel buffer. */
export function jobSlot(start: Date, durationMin: number): { start: Date; end: Date } {
  return {
    start,
    end: new Date(start.getTime() + (durationMin + matchingConfig.bufferMinutes) * MINUTE),
  }
}

export const toRange = (slot: { start: Date; end: Date }) =>
  `[${slot.start.toISOString()},${slot.end.toISOString()})`

/**
 * Checks the worker is free for a job starting at `start` (inside weekly hours for a
 * scheduled job; no clashing booking or time off either way). Returns up to three
 * alternative starts when it is not.
 */
export async function checkSlot(
  worker: LockedWorker,
  timing: 'ON_DEMAND' | 'SCHEDULED',
  start: Date,
  now: Date,
): Promise<{ free: true } | { free: false; alternatives: string[] }> {
  const { bufferMinutes, scheduling } = matchingConfig
  const horizon = new Date(start.getTime() + scheduling.horizonDays * 24 * 60 * MINUTE)
  const schedule = (
    await loadSchedules(
      [worker.workerId],
      new Date(Math.min(start.getTime(), now.getTime())),
      horizon,
    )
  ).get(worker.workerId)!

  const slot = jobSlot(start, worker.durationMin)
  const clashes = schedule.busy.some((b) => slot.start < b.end && b.start < slot.end)
  const free =
    timing === 'ON_DEMAND'
      ? !clashes
      : isSlotFree(start, {
          ...schedule,
          durationMin: worker.durationMin,
          bufferMin: bufferMinutes,
        })
  if (free) return { free: true }

  const alternatives = [
    ...takeFirst(
      freeStarts({
        ...schedule,
        durationMin: worker.durationMin,
        bufferMin: bufferMinutes,
        gridMin: scheduling.gridMinutes,
        from: new Date(Math.max(start.getTime(), now.getTime() + scheduling.leadMinutes * MINUTE)),
        until: horizon,
      }),
      3,
    ),
  ].map((d) => d.toISOString())
  return { free: false, alternatives }
}

function* takeFirst<T>(items: Iterable<T>, n: number): Generator<T> {
  if (n <= 0) return
  let i = 0
  for (const item of items) {
    yield item
    if (++i >= n) return
  }
}

/** Online and active within the freshness window (the same rule search uses). */
export function isAvailableNow(worker: LockedWorker, now: Date): boolean {
  return (
    worker.isOnline &&
    worker.lastActiveAt !== null &&
    now.getTime() - worker.lastActiveAt.getTime() < matchingConfig.onlineFreshMinutes * MINUTE
  )
}

/** Read-only version for pages: is this professional bookable right now (online, fresh, free)? */
export async function workerAvailableNow(
  workerId: string,
  durationMin: number,
  now: Date = new Date(),
) {
  const { onlineFreshMinutes, bufferMinutes } = matchingConfig
  const end = new Date(now.getTime() + (durationMin + bufferMinutes) * MINUTE)
  const [row] = await getDb().execute<{ ok: boolean }>(sql`
    select (w.is_online
      and w.last_active_at > ${new Date(now.getTime() - onlineFreshMinutes * MINUTE).toISOString()}::timestamptz
      and not exists (
        select 1 from bookings b where b.worker_id = w.id
          and b.status in ('CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS')
          and b.slot && tstzrange(${now.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz))
      and not exists (
        select 1 from worker_time_off t where t.worker_id = w.id
          and t.period && tstzrange(${now.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz))
    ) as ok
    from worker_profiles w where w.id = ${workerId}`)
  return row?.ok === true
}
