import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as analyticsRoute } from '@/app/api/v1/admin/analytics/route'
import { SESSION_COOKIE_PLAIN } from '@/modules/auth/cookies'
import { createSession } from '@/modules/auth/sessions'
import { createBooking } from '@/modules/bookings/create'
import { searchProfessionals } from '@/modules/matching/search'
import { call, json, req, userWithSession } from '@/test/api'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import { getAdminAnalytics } from './admin'
import { workerAnalytics } from './worker'

describe.skipIf(!hasTestDatabase)('analytics', () => {
  const sql = connectTestDb()
  let world: Awaited<ReturnType<typeof bookingWorld>>

  beforeEach(async () => {
    await truncateAll(sql)
    world = await bookingWorld(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  async function adminCookie() {
    const a = await userWithSession(sql, { role: 'ADMIN' })
    const { token } = await createSession({
      userId: a.userId,
      scope: 'ADMIN',
      ip: null,
      userAgent: null,
    })
    return `${SESSION_COOKIE_PLAIN}=${token}`
  }

  /** Requests from `c` to `w` that end each way an unbooked request can end. */
  async function unbooked(c: Awaited<ReturnType<typeof world.customer>>, w: { workerId: string }) {
    const declined = await createBooking(c.actor, world.request(c, w), randomUUID())
    await sql`update bookings set status = 'CANCELLED', cancelled_by = 'SYSTEM', cancelled_at = now(),
      cancellation_reason = 'The professional declined' where id = ${declined.bookingId}`
    await sql`update booking_invitations set status = 'DECLINED', responded_at = now() where booking_id = ${declined.bookingId}`
    const expired = await createBooking(c.actor, world.request(c, w), randomUUID())
    await sql`update bookings set status = 'EXPIRED' where id = ${expired.bookingId}`
    await sql`update booking_invitations set status = 'EXPIRED' where booking_id = ${expired.bookingId}`
    const open = await createBooking(c.actor, world.request(c, w), randomUUID())
    return { declined: declined.bookingId, expired: expired.bookingId, open: open.bookingId }
  }

  it('counts first-page searches, and those that found nobody, per day and service', async () => {
    const c = await world.customer()
    const [{ lat, lng }] = await sql`select lat, lng from addresses where id = ${c.addressId}`
    const query = { serviceId: world.serviceId, lat: String(lat), lng: String(lng) }
    await searchProfessionals(query) // nobody offers it yet
    await world.worker()
    const found = await searchProfessionals(query)
    expect(found.total).toBe(1)
    await searchProfessionals({ ...query, cursor: '20' }) // a later page is not a new search
    const rows = await sql`select searches, empty_results from search_daily_counts`
    expect(rows).toEqual([{ searches: 2, empty_results: 1 }])
  })

  it('builds the funnel, outcomes and supply by locality from bookings', async () => {
    const w = await world.worker()
    const c = await world.customer()
    await world.completed(w, c)
    const haggled = await world.completed(w, c)
    await sql`update bookings set listed_price_paise = 62500 where id = ${haggled.bookingId}`
    await unbooked(c, w)
    await sql`insert into search_daily_counts (day, service_id, searches, empty_results)
      values (current_date, ${world.serviceId}, 20, 4), (current_date - 40, ${world.serviceId}, 99, 9)`
    // Outside the 30-day window.
    const other = await world.customer()
    const old = await createBooking(other.actor, world.request(other, w), randomUUID())
    await sql`update bookings set created_at = now() - interval '40 days' where id = ${old.bookingId}`

    const a = await getAdminAnalytics({ days: '30' })
    expect(a.funnel.map((s) => [s.key, s.count])).toEqual([
      ['searches', 20],
      ['requests', 5],
      ['confirmed', 2],
      ['completed', 2],
    ])
    expect(a.emptySearches).toBe(4)
    expect(Object.fromEntries(a.outcomes.map((o) => [o.key, o.count]))).toEqual({
      LISTED: 1,
      NEGOTIATED: 1,
      DECLINED: 1,
      EXPIRED: 1,
      CANCELLED: 0,
      OPEN: 1,
    })
    expect(a.medianAgreedShare).toBeCloseTo(0.8)
    expect(a.localities).toEqual([
      expect.objectContaining({
        localityId: world.localityId,
        professionals: 1,
        onlineNow: 1,
        requests: 5,
        unfilled: 2,
      }),
    ])
    expect((await getAdminAnalytics({ days: '90' })).funnel[1].count).toBe(6)
  })

  it('is for admins only', async () => {
    const w = await world.worker()
    expect((await call(analyticsRoute, req('/', { cookie: w.cookie }))).status).toBe(403)
    const res = await call(analyticsRoute, req('/?days=7', { cookie: await adminCookie() }))
    expect(res.status).toBe(200)
    expect(await json(res)).toMatchObject({ days: 7 })
    const bad = await call(analyticsRoute, req('/?days=5', { cookie: await adminCookie() }))
    expect(bad.status).toBe(400)
  })

  it("shows a professional's weekly net, earnings by service and request outcomes", async () => {
    const w = await world.worker()
    const c = await world.customer()
    const job = await world.completed(w, c)
    const earlier = await world.completed(w, c)
    await unbooked(c, w)
    const post = (bookingId: string, type: string, amount: number, daysAgo: number) =>
      sql`insert into worker_ledger_entries (worker_id, booking_id, type, amount_paise, description, created_at)
        values (${w.workerId}, ${bookingId}, ${type}, ${amount}, 'test', now() - make_interval(days => ${daysAgo}))`
    await post(job.bookingId, 'JOB_EARNING', 50_000, 0)
    await post(job.bookingId, 'COMMISSION', -5_000, 0)
    await post(earlier.bookingId, 'JOB_EARNING', 30_000, 14)
    await post(earlier.bookingId, 'COMMISSION', -3_000, 14)
    // Payouts are not earnings.
    await sql`insert into worker_ledger_entries (worker_id, type, amount_paise, description)
      values (${w.workerId}, 'ADJUSTMENT', -1000, 'test')`

    const a = await workerAnalytics(w.workerId, 'all')
    expect(a.weeks).toHaveLength(8)
    expect(a.weeks.at(-1)).toMatchObject({ netPaise: 45_000, jobs: 1 })
    expect(a.weeks.reduce((n, wk) => n + wk.netPaise, 0)).toBe(72_000)
    expect(a.byService).toEqual([
      expect.objectContaining({ serviceId: world.serviceId, netPaise: 72_000, jobs: 2 }),
    ])
    expect(a.requests).toEqual({ days: 30, received: 5, won: 2, declined: 1, missed: 1 })
    expect((await workerAnalytics(w.workerId, 'week')).byService[0].netPaise).toBe(45_000)
  })
})
