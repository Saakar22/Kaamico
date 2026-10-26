import 'server-only'
import { sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { fromIst, toIstParts } from '@/lib/time'

export type AdminMetrics = {
  pendingVerifications: number
  /** Submission time of the oldest application waiting for review. */
  oldestPendingAt: string | null
  openRequests: number
  activeJobs: number
  bookingsToday: number
  completedToday: number
  /** Last 7 days. */
  cancellations7d: number
  bookings7d: number
  /** Median minutes from a request reaching a professional to their first reply, last 7 days. */
  medianResponseMinutes: number | null
  suspendedUsers: number
}

/**
 * KPI tiles for `/admin` (§4.4 step 2). Plain aggregates over indexed columns; the page
 * is admin-only and rarely loaded, so it reads live numbers rather than caching them.
 */
export async function getAdminMetrics(now: Date = new Date()): Promise<AdminMetrics> {
  const { year, month, day } = toIstParts(now)
  const todayStart = fromIst(year, month, day).toISOString()
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const [row] = await getDb().execute<{
    pending: number
    oldest: Date | string | null
    open_requests: number
    active_jobs: number
    bookings_today: number
    completed_today: number
    cancellations_7d: number
    bookings_7d: number
    median_response: number | null
    suspended: number
  }>(sql`
    select
      (select count(*)::int from verification_applications where status in ('SUBMITTED', 'UNDER_REVIEW')) as pending,
      (select min(submitted_at) from verification_applications where status in ('SUBMITTED', 'UNDER_REVIEW')) as oldest,
      (select count(*)::int from bookings where status in ('REQUESTED', 'NEGOTIATING')) as open_requests,
      (select count(*)::int from bookings where status in ('CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS')) as active_jobs,
      (select count(*)::int from bookings where created_at >= ${todayStart}::timestamptz) as bookings_today,
      (select count(*)::int from bookings where status = 'COMPLETED' and completed_at >= ${todayStart}::timestamptz) as completed_today,
      (select count(*)::int from bookings where status = 'CANCELLED' and cancelled_at >= ${weekAgo}::timestamptz) as cancellations_7d,
      (select count(*)::int from bookings where created_at >= ${weekAgo}::timestamptz) as bookings_7d,
      (select percentile_cont(0.5) within group (order by extract(epoch from (r.first_reply - i.created_at)) / 60)
         from booking_invitations i
         join worker_profiles w on w.id = i.worker_id
         cross join lateral (
           select least(
             i.responded_at,
             (select min(o.created_at) from price_offers o
               where o.booking_id = i.booking_id and o.worker_id = i.worker_id and o.offered_by = 'WORKER'),
             (select min(o.responded_at) from price_offers o
               where o.booking_id = i.booking_id and o.worker_id = i.worker_id
                 and o.offered_by = 'CUSTOMER' and o.responded_by_user_id = w.user_id)
           ) as first_reply
         ) r
         where i.created_at >= ${weekAgo}::timestamptz and r.first_reply is not null) as median_response,
      (select count(*)::int from users where status = 'SUSPENDED') as suspended`)
  return {
    pendingVerifications: row.pending,
    oldestPendingAt: row.oldest ? new Date(row.oldest).toISOString() : null,
    openRequests: row.open_requests,
    activeJobs: row.active_jobs,
    bookingsToday: row.bookings_today,
    completedToday: row.completed_today,
    cancellations7d: row.cancellations_7d,
    bookings7d: row.bookings_7d,
    medianResponseMinutes:
      row.median_response === null ? null : Math.round(Number(row.median_response)),
    suspendedUsers: row.suspended,
  }
}
