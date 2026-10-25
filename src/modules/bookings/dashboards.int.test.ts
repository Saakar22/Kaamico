import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as meDashboardRoute } from '@/app/api/v1/me/dashboard/route'
import { GET as listRoute } from '@/app/api/v1/bookings/route'
import { GET as workerJobRoute } from '@/app/api/v1/worker/bookings/[id]/route'
import { GET as workerJobsRoute } from '@/app/api/v1/worker/bookings/route'
import { GET as workerDashboardRoute } from '@/app/api/v1/worker/dashboard/route'
import { authSecret } from '@/lib/secrets'
import { acceptOffer, makeOffer } from '@/modules/negotiation/offers'
import { call, json, req, withId } from '@/test/api'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import { createBooking } from './create'
import { cancelBooking, decideCharge, proposeCharge, transition } from './lifecycle'
import {
  getCustomerDashboard,
  getWorkerJobSummary,
  listCustomerBookings,
  listWorkerJobs,
} from './lists'
import { deriveStartCode } from './start-code'
import { getWorkerBooking } from './views'

const MIN = 60_000
const HOUR = 60 * MIN

describe.skipIf(!hasTestDatabase)('booking lists and dashboards', () => {
  const sql = connectTestDb()
  let world: Awaited<ReturnType<typeof bookingWorld>>

  beforeEach(async () => {
    await truncateAll(sql)
    world = await bookingWorld(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  const version = async (id: string) =>
    (await sql`select version from bookings where id = ${id}`)[0].version as number
  const pending = async (id: string) =>
    (await sql`select id from price_offers where booking_id = ${id} and status = 'PENDING'`)[0]

  type W = Awaited<ReturnType<typeof world.worker>>
  type C = Awaited<ReturnType<typeof world.customer>>

  /** Confirmed by the worker accepting the listed price; the slot starts `startsIn` from now. */
  async function confirmed(w: W, c: C, startsIn: number) {
    const { bookingId } = await createBooking(c.actor, world.request(c, w), world.key())
    await acceptOffer(w.actor, (await pending(bookingId)).id, {
      expectedBookingVersion: await version(bookingId),
    })
    const start = new Date(Date.now() + startsIn)
    await sql`update bookings set slot = tstzrange(${start}, ${new Date(start.getTime() + HOUR)}) where id = ${bookingId}`
    return bookingId
  }

  async function complete(w: W, bookingId: string) {
    for (const to of ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED']) {
      await transition(w.actor, bookingId, {
        to,
        expectedVersion: await version(bookingId),
        startCode: deriveStartCode(bookingId, authSecret()),
      })
    }
  }

  it('sorts the customer’s bookings into tabs and pages through them', async () => {
    const w1 = await world.worker()
    const w2 = await world.worker()
    const w3 = await world.worker()
    const c = await world.customer()

    const upcoming = await confirmed(w1, c, 30 * MIN)
    const past = await confirmed(w2, c, 30 * MIN)
    await complete(w2, past)
    const { bookingId: open } = await createBooking(
      c.actor,
      world.request(c, w3, { priceDecision: { type: 'OFFER', amountPaise: 40000 } }),
      world.key(),
    )
    const ids = async (tab: 'active' | 'upcoming' | 'past' | 'cancelled') =>
      (await listCustomerBookings(c.actor, { tab })).bookings.map((b) => b.id)

    expect(await ids('active')).toEqual([open])
    expect(await ids('upcoming')).toEqual([upcoming])
    expect(await ids('past')).toEqual([past])
    expect(await ids('cancelled')).toEqual([])
    const [item] = (await listCustomerBookings(c.actor, { tab: 'active' })).bookings
    expect(item).toMatchObject({
      workerName: 'Rakesh Patil',
      needsAction: false,
      pricePaise: 50000,
    })

    // The professional's counter needs the customer's answer.
    await makeOffer(w3.actor, open, { amountPaise: 46000 })
    expect((await listCustomerBookings(c.actor, { tab: 'active' })).bookings[0].needsAction).toBe(
      true,
    )

    // 22 cancelled requests: two pages, newest first, no repeats.
    const cancelled: string[] = []
    for (let i = 0; i < 22; i++) {
      const { bookingId } = await createBooking(c.actor, world.request(c, w1), world.key())
      await cancelBooking(c.actor, bookingId, { expectedVersion: await version(bookingId) })
      cancelled.unshift(bookingId)
    }
    const first = await listCustomerBookings(c.actor, { tab: 'cancelled' })
    expect(first.bookings).toHaveLength(20)
    const second = await listCustomerBookings(c.actor, {
      tab: 'cancelled',
      cursor: first.nextCursor,
    })
    expect(second.nextCursor).toBeNull()
    expect([...first.bookings, ...second.bookings].map((b) => b.id)).toEqual(cancelled)

    const res = await call(listRoute, req('/api/v1/bookings?tab=upcoming', { cookie: c.cookie }))
    expect((await json(res)).bookings.map((b: { id: string }) => b.id)).toEqual([upcoming])
    expect(
      (await call(listRoute, req('/api/v1/bookings?tab=bogus', { cookie: c.cookie }))).status,
    ).toBe(400)
    // Other customers see none of it.
    const other = await world.customer()
    expect((await listCustomerBookings(other.actor, { tab: 'cancelled' })).bookings).toEqual([])
  })

  it('builds the customer’s action inbox', async () => {
    const w1 = await world.worker()
    const w2 = await world.worker()
    const c = await world.customer()
    const { bookingId: open } = await createBooking(
      c.actor,
      world.request(c, w1, { priceDecision: { type: 'OFFER', amountPaise: 40000 } }),
      world.key(),
    )
    await makeOffer(w1.actor, open, { amountPaise: 46000 })
    const job = await confirmed(w2, c, 30 * MIN)
    for (const to of ['EN_ROUTE', 'ARRIVED']) {
      await transition(w2.actor, job, { to, expectedVersion: await version(job) })
    }
    const { chargeId } = await proposeCharge(w2.actor, job, {
      kind: 'MATERIALS',
      description: 'New washer',
      amountPaise: 5000,
    })

    const res = await call(meDashboardRoute, req('/api/v1/me/dashboard', { cookie: c.cookie }))
    const dash = await json(res)
    expect(dash.pendingOffers).toEqual([
      expect.objectContaining({ bookingId: open, amountPaise: 46000, workerName: 'Rakesh Patil' }),
    ])
    expect(dash.pendingCharges).toEqual([
      expect.objectContaining({ bookingId: job, chargeId, description: 'New washer' }),
    ])
    expect(dash.activeBooking).toMatchObject({ id: job, status: 'ARRIVED', needsAction: true })
    expect(dash.waiting.map((b: { id: string }) => b.id)).toEqual([open])
    expect(dash.rebook).toEqual([])

    await decideCharge(c.actor, chargeId, 'APPROVED')
    await transition(w2.actor, job, {
      to: 'IN_PROGRESS',
      expectedVersion: await version(job),
      startCode: deriveStartCode(job, authSecret()),
    })
    await transition(w2.actor, job, { to: 'COMPLETED', expectedVersion: await version(job) })
    const after = await getCustomerDashboard(c.actor)
    expect(after.pendingCharges).toEqual([])
    expect(after.activeBooking).toBeNull()
    expect(after.rebook).toEqual([
      {
        serviceId: world.serviceId,
        serviceName: 'Tap repair',
        workerId: w2.workerId,
        workerName: 'Rakesh Patil',
      },
    ])
  })

  it('splits the professional’s jobs into today, upcoming, completed and cancelled', async () => {
    const w = await world.worker()
    const [c1, c2, c3, c4] = await Promise.all([1, 2, 3, 4].map(() => world.customer()))
    // Started 10 minutes ago (overdue counts as today), so the test holds near midnight too.
    const today = await confirmed(w, c1, -10 * MIN)
    const later = await confirmed(w, c2, 3 * 24 * HOUR)
    const done = await confirmed(w, c3, 60 * MIN)
    await complete(w, done)
    const dropped = await confirmed(w, c4, 5 * 24 * HOUR)
    await cancelBooking(w.actor, dropped, {
      reason: 'Unwell',
      expectedVersion: await version(dropped),
    })

    const ids = async (tab: 'today' | 'upcoming' | 'completed' | 'cancelled') =>
      (await listWorkerJobs(w.actor, { tab })).jobs.map((j) => j.id)
    expect(await ids('today')).toEqual([today])
    expect(await ids('upcoming')).toEqual([later])
    expect(await ids('completed')).toEqual([done])
    expect(await ids('cancelled')).toEqual([dropped])
    const [job] = (await listWorkerJobs(w.actor, { tab: 'today' })).jobs
    expect(job).toMatchObject({ customerFirstName: 'Priya', pricePaise: 50000 })
    expect(job).not.toHaveProperty('address')

    const summary = await getWorkerJobSummary(w.actor)
    expect(summary.today.map((j) => j.id)).toEqual([today])
    expect(summary.week).toEqual({ completedJobs: 1, jobValuePaise: 50000 })

    const res = await call(
      workerDashboardRoute,
      req('/api/v1/worker/dashboard', { cookie: w.cookie }),
    )
    expect((await json(res)).jobs.today).toHaveLength(1)
    const list = await call(
      workerJobsRoute,
      req('/api/v1/worker/bookings?tab=upcoming', { cookie: w.cookie }),
    )
    expect((await json(list)).jobs.map((j: { id: string }) => j.id)).toEqual([later])
    expect(
      (await call(workerJobsRoute, req('/api/v1/worker/bookings', { cookie: c1.cookie }))).status,
    ).toBe(403)
  })

  it('counts customer offers waiting for the professional’s reply', async () => {
    const w = await world.worker()
    const c1 = await world.customer()
    const c2 = await world.customer()
    await createBooking(c1.actor, world.request(c1, w), world.key())
    const { bookingId } = await createBooking(c2.actor, world.request(c2, w), world.key())
    expect((await getWorkerJobSummary(w.actor)).requestsAwaitingReply).toBe(2)
    await makeOffer(w.actor, bookingId, { amountPaise: 48000 })
    expect((await getWorkerJobSummary(w.actor)).requestsAwaitingReply).toBe(1)
  })

  it('shows a job only to its professional, with the address while it is active', async () => {
    const w = await world.worker()
    const other = await world.worker()
    const c = await world.customer()
    const bookingId = await confirmed(w, c, 30 * MIN)

    const job = await getWorkerBooking(w.actor, bookingId)
    expect(job).toMatchObject({ assigned: true, status: 'CONFIRMED' })
    expect(job.address?.line1).toBe('Flat 302, Sai Residency')
    expect(job.location).toEqual({ lat: 18.5074, lng: 73.8077 })
    expect(job).not.toHaveProperty('startCode')

    const res = await call(workerJobRoute, req('/', { cookie: other.cookie }), withId(bookingId))
    expect(res.status).toBe(404)
    expect(
      (await call(workerJobRoute, req('/', { cookie: c.cookie }), withId(bookingId))).status,
    ).toBe(403)
    expect(
      (await call(workerJobRoute, req('/', { cookie: w.cookie }), withId('nope'))).status,
    ).toBe(404)

    await complete(w, bookingId)
    expect((await getWorkerBooking(w.actor, bookingId)).address).not.toBeNull()
    const dayLater = new Date(Date.now() + 25 * HOUR)
    const old = await getWorkerBooking(w.actor, bookingId, dayLater)
    expect(old.address).toBeNull()
    expect(old.location).toBeNull()
  })

  it('does not treat an unconfirmed request as the professional’s job', async () => {
    const w = await world.worker()
    const c = await world.customer()
    const { bookingId } = await createBooking(c.actor, world.request(c, w), world.key())
    expect(
      await getWorkerBooking(w.actor, bookingId).then(
        () => 'OK',
        (e) => e.code,
      ),
    ).toBe('NOT_FOUND')
  })
})
