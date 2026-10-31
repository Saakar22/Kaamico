import 'server-only'
import { sql } from 'drizzle-orm'
import { getDb } from '@/db/client'

export type CancellingPair = {
  customerId: string
  customerName: string | null
  workerId: string
  workerName: string
  cancellations: number
  byCustomer: number
  byWorker: number
  lastAt: string
  bookings: { id: string; code: string }[]
}

/**
 * Customer–professional pairs who keep cancelling confirmed jobs with each other: a sign
 * they may be settling the work off Kaamico (§11.5 abuse prevention, an admin report).
 */
export async function repeatCancellingPairs(
  opts: { days?: number; min?: number; limit?: number; now?: Date } = {},
): Promise<CancellingPair[]> {
  const { days = 30, min = 2, limit = 20, now = new Date() } = opts
  const since = new Date(now.getTime() - days * 86_400_000).toISOString()
  const rows = await getDb().execute<{
    customer_id: string
    customer_name: string | null
    worker_id: string
    worker_name: string
    cancellations: number
    by_customer: number
    by_worker: number
    last_at: Date | string
    bookings: { id: string; code: string }[] | string
  }>(sql`
    select b.customer_id, cu.name as customer_name, b.worker_id, w.display_name as worker_name,
           count(*)::int as cancellations,
           (count(*) filter (where b.cancelled_by = 'CUSTOMER'))::int as by_customer,
           (count(*) filter (where b.cancelled_by = 'WORKER'))::int as by_worker,
           max(b.cancelled_at) as last_at,
           json_agg(json_build_object('id', b.id, 'code', b.code) order by b.cancelled_at desc) as bookings
    from bookings b
    join users cu on cu.id = b.customer_id
    join worker_profiles w on w.id = b.worker_id
    where b.status = 'CANCELLED' and b.confirmed_at is not null
      and b.cancelled_at >= ${since}::timestamptz
    group by b.customer_id, cu.name, b.worker_id, w.display_name
    having count(*) >= ${min}
    order by count(*) desc, max(b.cancelled_at) desc
    limit ${limit}`)
  return rows.map((r) => ({
    customerId: r.customer_id,
    customerName: r.customer_name,
    workerId: r.worker_id,
    workerName: r.worker_name,
    cancellations: r.cancellations,
    byCustomer: r.by_customer,
    byWorker: r.by_worker,
    lastAt: new Date(r.last_at).toISOString(),
    bookings: typeof r.bookings === 'string' ? JSON.parse(r.bookings) : r.bookings,
  }))
}
