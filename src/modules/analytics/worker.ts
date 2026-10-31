import 'server-only'
import { sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { periodStart, type Period } from '@/modules/ledger/earnings'
import type { Locale } from '@/i18n/config'
import { localized } from '@/modules/catalog/catalog'

const WEEK_MS = 7 * 86_400_000

export type WeeklyEarnings = {
  /** Monday 00:00 IST. */
  weekStart: string
  netPaise: number
  jobs: number
}

export type ServiceEarnings = { serviceId: string; name: string; netPaise: number; jobs: number }

export type RequestStats = {
  days: number
  received: number
  /** Requests that became a booking with this professional. */
  won: number
  declined: number
  /** Requests that ran out of time, or that the customer booked with someone else. */
  missed: number
}

export type WorkerAnalytics = {
  weeks: WeeklyEarnings[]
  byService: ServiceEarnings[]
  requests: RequestStats
}

/**
 * Earnings trend and request outcomes for the professional's earnings page (P1 "worker
 * earnings analytics"). Net = job value minus Kaamico's fee, from the ledger, so it
 * agrees with the summary above it; refunds and payouts are left out of the trend.
 */
export async function workerAnalytics(
  workerId: string,
  period: Period,
  now: Date = new Date(),
  weekCount = 8,
  locale: Locale = 'en',
): Promise<WorkerAnalytics> {
  const thisWeek = periodStart('week', now)!
  const first = new Date(thisWeek.getTime() - (weekCount - 1) * WEEK_MS)
  const from = periodStart(period, now)
  const since = from ? sql`and e.created_at >= ${from.toISOString()}::timestamptz` : sql``
  const requestDays = 30
  const requestsFrom = new Date(now.getTime() - requestDays * 86_400_000)
  const db = getDb()

  const [weekly, services, [requests]] = await Promise.all([
    db.execute<{ week: number; net: number; jobs: number }>(sql`
      select floor(extract(epoch from (created_at - ${first.toISOString()}::timestamptz)) / ${WEEK_MS / 1000})::int as week,
        sum(amount_paise)::int as net,
        (count(*) filter (where type = 'JOB_EARNING'))::int as jobs
      from worker_ledger_entries
      where worker_id = ${workerId} and type in ('JOB_EARNING', 'COMMISSION')
        and created_at >= ${first.toISOString()}::timestamptz
      group by 1`),
    db.execute<{ service_id: string; name: string; net: number; jobs: number }>(sql`
      select s.id as service_id, ${localized(locale, 's', 'name')} as name, sum(e.amount_paise)::int as net,
        (count(*) filter (where e.type = 'JOB_EARNING'))::int as jobs
      from worker_ledger_entries e
      join bookings b on b.id = e.booking_id
      join services s on s.id = b.service_id
      where e.worker_id = ${workerId} and e.type in ('JOB_EARNING', 'COMMISSION') ${since}
      group by s.id
      having sum(e.amount_paise) <> 0
      order by net desc, name
      limit 8`),
    db.execute<{ received: number; won: number; declined: number; missed: number }>(sql`
      select count(*)::int as received,
        (count(*) filter (where i.status = 'WON'
          or (b.worker_id = i.worker_id and b.confirmed_at is not null)))::int as won,
        (count(*) filter (where i.status = 'DECLINED'))::int as declined,
        (count(*) filter (where i.status in ('EXPIRED', 'LOST')))::int as missed
      from booking_invitations i
      join bookings b on b.id = i.booking_id
      where i.worker_id = ${workerId} and i.created_at >= ${requestsFrom.toISOString()}::timestamptz`),
  ])

  const byWeek = new Map(weekly.map((w) => [w.week, w]))
  return {
    weeks: Array.from({ length: weekCount }, (_, i) => ({
      weekStart: new Date(first.getTime() + i * WEEK_MS).toISOString(),
      netPaise: byWeek.get(i)?.net ?? 0,
      jobs: byWeek.get(i)?.jobs ?? 0,
    })),
    byService: services.map((s) => ({
      serviceId: s.service_id,
      name: s.name,
      netPaise: s.net,
      jobs: s.jobs,
    })),
    requests: { days: requestDays, ...requests },
  }
}
