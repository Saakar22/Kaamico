import 'server-only'
import { sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { fromIst, toIstParts } from '@/lib/time'
import type { Actor } from '@/modules/auth/types'
import { photoUrl } from '@/modules/uploads/serve'
import { expireDue } from './repo'
import type { BookingStatus } from './state-machine'

/**
 * Booking lists and dashboards for both sides (IMPLEMENTATION_PLAN.md §5, §10.6–10.7).
 * Lists use keyset cursors: the sort key is carried as Postgres text so microseconds survive.
 */

const PAGE = 20
const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null)
const firstName = (name: string | null) => (name ?? 'Customer').trim().split(/\s+/)[0]

type Cursor = { key: string; id: string }

function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null
  try {
    const parsed = z
      .object({ key: z.string().min(1).max(40), id: z.uuid() })
      .parse(JSON.parse(Buffer.from(raw, 'base64url').toString()))
    return Number.isNaN(new Date(parsed.key).getTime()) ? null : parsed
  } catch {
    return null
  }
}
const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url')

type Order = { key: SQL; dir: 'asc' | 'desc' }

/** `where` fragment and `order by` for one keyset page. */
function keyset(order: Order, cursor: Cursor | null) {
  const after = cursor
    ? order.dir === 'asc'
      ? sql`and (${order.key}, b.id) > (${cursor.key}::timestamptz, ${cursor.id}::uuid)`
      : sql`and (${order.key}, b.id) < (${cursor.key}::timestamptz, ${cursor.id}::uuid)`
    : sql``
  const by =
    order.dir === 'asc' ? sql`${order.key} asc, b.id asc` : sql`${order.key} desc, b.id desc`
  return { after, by }
}

function page<T extends { sort_key: string; id: string }>(rows: T[]) {
  const items = rows.slice(0, PAGE)
  const last = items.at(-1)
  return {
    items,
    nextCursor:
      rows.length > PAGE && last ? encodeCursor({ key: last.sort_key, id: last.id }) : null,
  }
}

// --- Customer -------------------------------------------------------------------------

export const CUSTOMER_TABS = ['active', 'upcoming', 'past', 'cancelled'] as const
export type CustomerTab = (typeof CUSTOMER_TABS)[number]

const CUSTOMER_TAB: Record<CustomerTab, { where: SQL; order: Order }> = {
  // Waiting on someone, or the professional is on the way / working.
  active: {
    where: sql`b.status in ('REQUESTED', 'NEGOTIATING', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'DISPUTED')`,
    order: { key: sql`b.created_at`, dir: 'desc' },
  },
  upcoming: {
    where: sql`b.status = 'CONFIRMED'`,
    order: { key: sql`lower(b.slot)`, dir: 'asc' },
  },
  past: {
    where: sql`b.status = 'COMPLETED'`,
    order: { key: sql`coalesce(b.completed_at, b.updated_at)`, dir: 'desc' },
  },
  cancelled: {
    where: sql`b.status in ('CANCELLED', 'EXPIRED')`,
    order: { key: sql`b.updated_at`, dir: 'desc' },
  },
}

export type CustomerBookingItem = {
  id: string
  code: string
  status: BookingStatus
  serviceId: string
  serviceName: string
  workerId: string
  workerName: string
  workerPhotoUrl: string | null
  timing: 'ON_DEMAND' | 'SCHEDULED'
  /** The confirmed slot start, else the requested start. */
  startsAt: string
  localityLabel: string
  pricePaise: number | null
  /** A professional's offer or an extra charge is waiting for the customer. */
  needsAction: boolean
}

type CustomerRow = {
  id: string
  sort_key: string
  code: string
  status: BookingStatus
  service_id: string
  service_name: string
  worker_id: string
  worker_name: string
  worker_photo: string | null
  timing: 'ON_DEMAND' | 'SCHEDULED'
  starts_at: Date | string
  locality_label: string
  price_paise: number | null
  needs_action: boolean
}

async function customerRows(
  actor: Actor,
  q: { where: SQL; sortKey: SQL; orderBy: SQL; limit: number; after?: SQL },
): Promise<CustomerRow[]> {
  return getDb().execute<CustomerRow>(sql`
    select b.id, b.code, b.status, b.service_id, s.name as service_name,
           i.worker_id, w.display_name as worker_name, w.photo_key as worker_photo,
           b.timing, coalesce(lower(b.slot), b.requested_start) as starts_at, b.locality_label,
           coalesce(b.final_amount_paise, b.agreed_price_paise, b.listed_price_paise) as price_paise,
           (exists (select 1 from price_offers o where o.booking_id = b.id and o.status = 'PENDING'
                      and o.offered_by = 'WORKER' and b.status in ('REQUESTED', 'NEGOTIATING'))
            or exists (select 1 from booking_charges c where c.booking_id = b.id and c.status = 'PROPOSED')
           ) as needs_action,
           sort_key
    from bookings b
    join services s on s.id = b.service_id
    join lateral (
      select worker_id from booking_invitations
      where booking_id = b.id order by (worker_id = b.worker_id) desc nulls last limit 1
    ) i on true
    join worker_profiles w on w.id = i.worker_id
    cross join lateral (select ${q.sortKey}::text as sort_key) k
    where b.customer_id = ${actor.userId} and (${q.where}) ${q.after ?? sql``}
    order by ${q.orderBy}
    limit ${q.limit}`)
}

function toCustomerItem(r: CustomerRow): CustomerBookingItem {
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    serviceId: r.service_id,
    serviceName: r.service_name,
    workerId: r.worker_id,
    workerName: r.worker_name,
    workerPhotoUrl: photoUrl(r.worker_id, r.worker_photo),
    timing: r.timing,
    startsAt: iso(r.starts_at)!,
    localityLabel: r.locality_label,
    pricePaise: r.price_paise,
    needsAction: r.needs_action,
  }
}

/** The customer's bookings for one tab (§5 `/bookings`), one page at a time. */
export async function listCustomerBookings(
  actor: Actor,
  options: { tab?: CustomerTab; cursor?: string | null } = {},
  now: Date = new Date(),
): Promise<{ bookings: CustomerBookingItem[]; nextCursor: string | null }> {
  await expireDue(now)
  const tab = CUSTOMER_TAB[options.tab ?? 'active']
  const { after, by } = keyset(tab.order, decodeCursor(options.cursor))
  const rows = await customerRows(actor, {
    where: tab.where,
    after,
    orderBy: by,
    limit: PAGE + 1,
    sortKey: tab.order.key,
  })
  const { items, nextCursor } = page(rows)
  return { bookings: items.map(toCustomerItem), nextCursor }
}

export type CustomerDashboard = {
  pendingOffers: {
    bookingId: string
    code: string
    serviceName: string
    workerName: string
    amountPaise: number
    expiresAt: string
  }[]
  pendingCharges: {
    bookingId: string
    chargeId: string
    code: string
    serviceName: string
    workerName: string
    description: string
    amountPaise: number
  }[]
  /** The job happening now, else the next confirmed one. */
  activeBooking: CustomerBookingItem | null
  /** Requests still waiting for the professional. */
  waiting: CustomerBookingItem[]
  /** Recently completed jobs, one per professional and service, for quick rebooking. */
  rebook: { serviceId: string; serviceName: string; workerId: string; workerName: string }[]
}

/** `GET /me/dashboard`: what needs the customer's attention first. */
export async function getCustomerDashboard(
  actor: Actor,
  now: Date = new Date(),
): Promise<CustomerDashboard> {
  await expireDue(now)
  const db = getDb()
  const [offers, charges, active, waiting, rebook] = await Promise.all([
    db.execute<{
      booking_id: string
      code: string
      service_name: string
      worker_name: string
      amount_paise: number
      expires_at: Date | string
    }>(sql`
      select b.id as booking_id, b.code, s.name as service_name, w.display_name as worker_name,
             o.amount_paise, o.expires_at
      from price_offers o
      join bookings b on b.id = o.booking_id
      join services s on s.id = b.service_id
      join worker_profiles w on w.id = o.worker_id
      where b.customer_id = ${actor.userId} and o.status = 'PENDING' and o.offered_by = 'WORKER'
        and b.status in ('REQUESTED', 'NEGOTIATING')
      order by o.expires_at asc
      limit 10`),
    db.execute<{
      booking_id: string
      charge_id: string
      code: string
      service_name: string
      worker_name: string
      description: string
      amount_paise: number
    }>(sql`
      select b.id as booking_id, c.id as charge_id, b.code, s.name as service_name,
             w.display_name as worker_name, c.description, c.amount_paise
      from booking_charges c
      join bookings b on b.id = c.booking_id
      join services s on s.id = b.service_id
      join worker_profiles w on w.id = b.worker_id
      where b.customer_id = ${actor.userId} and c.status = 'PROPOSED'
      order by c.created_at asc
      limit 10`),
    customerRows(actor, {
      where: sql`b.status in ('CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS')`,
      orderBy: sql`(b.status <> 'CONFIRMED') desc, lower(b.slot) asc`,
      limit: 1,
      sortKey: sql`b.created_at`,
    }),
    customerRows(actor, {
      where: sql`b.status in ('REQUESTED', 'NEGOTIATING')`,
      orderBy: sql`b.created_at desc`,
      limit: 3,
      sortKey: sql`b.created_at`,
    }),
    db.execute<{
      service_id: string
      service_name: string
      worker_id: string
      worker_name: string
    }>(sql`
      select service_id, service_name, worker_id, worker_name from (
        select distinct on (b.worker_id, b.service_id)
               b.service_id, s.name as service_name, b.worker_id, w.display_name as worker_name,
               b.completed_at
        from bookings b
        join services s on s.id = b.service_id and s.is_active
        join worker_profiles w on w.id = b.worker_id and w.verification_status = 'VERIFIED'
        where b.customer_id = ${actor.userId} and b.status = 'COMPLETED'
        order by b.worker_id, b.service_id, b.completed_at desc
      ) t
      order by completed_at desc
      limit 4`),
  ])

  return {
    pendingOffers: offers.map((o) => ({
      bookingId: o.booking_id,
      code: o.code,
      serviceName: o.service_name,
      workerName: o.worker_name,
      amountPaise: o.amount_paise,
      expiresAt: iso(o.expires_at)!,
    })),
    pendingCharges: charges.map((c) => ({
      bookingId: c.booking_id,
      chargeId: c.charge_id,
      code: c.code,
      serviceName: c.service_name,
      workerName: c.worker_name,
      description: c.description,
      amountPaise: c.amount_paise,
    })),
    activeBooking: active[0] ? toCustomerItem(active[0]) : null,
    waiting: waiting.map(toCustomerItem),
    rebook: rebook.map((r) => ({
      serviceId: r.service_id,
      serviceName: r.service_name,
      workerId: r.worker_id,
      workerName: r.worker_name,
    })),
  }
}

// --- Worker ---------------------------------------------------------------------------

export const WORKER_TABS = ['today', 'upcoming', 'completed', 'cancelled'] as const
export type WorkerTab = (typeof WORKER_TABS)[number]

/** Midnight at the end of today in IST. */
function endOfIstDay(now: Date): Date {
  const { year, month, day } = toIstParts(now)
  return fromIst(year, month, day + 1)
}

function workerTab(tab: WorkerTab, now: Date): { where: SQL; order: Order } {
  const end = endOfIstDay(now)
  switch (tab) {
    // Started jobs, plus confirmed ones due today (or overdue).
    case 'today':
      return {
        where: sql`b.status in ('EN_ROUTE', 'ARRIVED', 'IN_PROGRESS')
                   or (b.status = 'CONFIRMED' and lower(b.slot) < ${end.toISOString()}::timestamptz)`,
        order: { key: sql`lower(b.slot)`, dir: 'asc' },
      }
    case 'upcoming':
      return {
        where: sql`b.status = 'CONFIRMED' and lower(b.slot) >= ${end.toISOString()}::timestamptz`,
        order: { key: sql`lower(b.slot)`, dir: 'asc' },
      }
    case 'completed':
      return {
        where: sql`b.status in ('COMPLETED', 'DISPUTED')`,
        order: { key: sql`coalesce(b.completed_at, b.updated_at)`, dir: 'desc' },
      }
    case 'cancelled':
      return {
        where: sql`b.status = 'CANCELLED'`,
        order: { key: sql`coalesce(b.cancelled_at, b.updated_at)`, dir: 'desc' },
      }
  }
}

export type WorkerJobItem = {
  id: string
  code: string
  status: BookingStatus
  serviceName: string
  customerFirstName: string
  localityLabel: string
  timing: 'ON_DEMAND' | 'SCHEDULED'
  startsAt: string
  pricePaise: number | null
  /** An extra charge is waiting for the customer. */
  chargePending: boolean
}

type WorkerRow = {
  id: string
  sort_key: string
  code: string
  status: BookingStatus
  service_name: string
  customer_name: string | null
  locality_label: string
  timing: 'ON_DEMAND' | 'SCHEDULED'
  starts_at: Date | string
  price_paise: number | null
  charge_pending: boolean
}

/** Jobs assigned to the professional (§5 `/worker/bookings`). Never includes addresses. */
export async function listWorkerJobs(
  actor: Actor,
  options: { tab?: WorkerTab; cursor?: string | null } = {},
  now: Date = new Date(),
): Promise<{ jobs: WorkerJobItem[]; nextCursor: string | null }> {
  if (!actor.workerId) return { jobs: [], nextCursor: null }
  const tab = workerTab(options.tab ?? 'today', now)
  const { after, by } = keyset(tab.order, decodeCursor(options.cursor))
  const rows = await getDb().execute<WorkerRow>(sql`
    select b.id, b.code, b.status, s.name as service_name, cu.name as customer_name,
           b.locality_label, b.timing, coalesce(lower(b.slot), b.requested_start) as starts_at,
           coalesce(b.final_amount_paise, b.agreed_price_paise) as price_paise,
           exists (select 1 from booking_charges c where c.booking_id = b.id and c.status = 'PROPOSED') as charge_pending,
           sort_key
    from bookings b
    join services s on s.id = b.service_id
    join users cu on cu.id = b.customer_id
    cross join lateral (select ${tab.order.key}::text as sort_key) k
    where b.worker_id = ${actor.workerId} and (${tab.where}) ${after}
    order by ${by}
    limit ${PAGE + 1}`)
  const { items, nextCursor } = page(rows)
  return {
    jobs: items.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      serviceName: r.service_name,
      customerFirstName: firstName(r.customer_name),
      localityLabel: r.locality_label,
      timing: r.timing,
      startsAt: iso(r.starts_at)!,
      pricePaise: r.price_paise,
      chargePending: r.charge_pending,
    })),
    nextCursor,
  }
}

/** Monday 00:00 IST of the current week. */
function startOfIstWeek(now: Date): Date {
  const { year, month, day } = toIstParts(now)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() // 0 = Sunday
  return fromIst(year, month, day - ((weekday + 6) % 7))
}

export type WorkerJobSummary = {
  today: WorkerJobItem[]
  /** New requests plus customer offers waiting for a reply. */
  requestsAwaitingReply: number
  week: { completedJobs: number; jobValuePaise: number }
}

/** The jobs part of `GET /worker/dashboard`. */
export async function getWorkerJobSummary(
  actor: Actor,
  now: Date = new Date(),
): Promise<WorkerJobSummary> {
  await expireDue(now)
  const weekStart = startOfIstWeek(now).toISOString()
  const [{ jobs }, [counts]] = await Promise.all([
    listWorkerJobs(actor, { tab: 'today' }, now),
    getDb().execute<{ awaiting: number; completed: number; value: number }>(sql`
      select
        (select count(*)::int from booking_invitations i join bookings b on b.id = i.booking_id
          where i.worker_id = ${actor.workerId} and b.status in ('REQUESTED', 'NEGOTIATING')
            and i.status not in ('DECLINED', 'EXPIRED', 'LOST')
            and exists (select 1 from price_offers o where o.booking_id = b.id and o.worker_id = i.worker_id
                          and o.status = 'PENDING' and o.offered_by = 'CUSTOMER')) as awaiting,
        (select count(*)::int from bookings b where b.worker_id = ${actor.workerId}
          and b.status = 'COMPLETED' and b.completed_at >= ${weekStart}::timestamptz) as completed,
        (select coalesce(sum(b.final_amount_paise), 0)::int from bookings b where b.worker_id = ${actor.workerId}
          and b.status = 'COMPLETED' and b.completed_at >= ${weekStart}::timestamptz) as value`),
  ])
  return {
    today: jobs,
    requestsAwaitingReply: counts.awaiting,
    week: { completedJobs: counts.completed, jobValuePaise: counts.value },
  }
}
