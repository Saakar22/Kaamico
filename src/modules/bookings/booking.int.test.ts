import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as sweepRoute } from '@/app/api/internal/sweep/route'
import { GET as getBookingRoute } from '@/app/api/v1/bookings/[id]/route'
import { POST as createRoute } from '@/app/api/v1/bookings/route'
import { POST as approveChargeRoute } from '@/app/api/v1/charges/[id]/approve/route'
import { POST as acceptRoute } from '@/app/api/v1/offers/[id]/accept/route'
import { GET as workerRequestRoute } from '@/app/api/v1/worker/requests/[id]/route'
import { GET as workerRequestsRoute } from '@/app/api/v1/worker/requests/route'
import { authSecret } from '@/lib/secrets'
import {
  acceptOffer,
  makeOffer,
  postMessage,
  rejectOffer,
  withdrawOffer,
} from '@/modules/negotiation/offers'
import { call, json, req, withId } from '@/test/api'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, PG, truncateAll } from '@/test/db'
import { createBooking } from './create'
import { cancelBooking, decideCharge, declineRequest, proposeCharge, transition } from './lifecycle'
import { deriveStartCode } from './start-code'
import { BOOKING_STATUSES, WORKER_STEPS, type BookingStatus } from './state-machine'
import { getCustomerBooking, getWorkerRequest } from './views'

const MIN = 60_000

async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'OK'
  } catch (e) {
    return (e as { code?: string }).code ?? String(e)
  }
}

describe.skipIf(!hasTestDatabase)('bookings and negotiation', () => {
  const sql = connectTestDb()
  let world: Awaited<ReturnType<typeof bookingWorld>>

  beforeEach(async () => {
    await truncateAll(sql)
    world = await bookingWorld(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  const pendingOffer = async (bookingId: string) =>
    (
      await sql`select id, offered_by, amount_paise from price_offers where booking_id = ${bookingId} and status = 'PENDING'`
    )[0]
  const bookingRow = async (id: string) => (await sql`select * from bookings where id = ${id}`)[0]

  /** A requested booking: the customer's offer at the listed price (₹500) waits for the worker. */
  async function requested(overrides: Record<string, unknown> = {}) {
    const w = await world.worker()
    const c = await world.customer()
    const { bookingId } = await createBooking(c.actor, world.request(c, w, overrides), world.key())
    return { w, c, bookingId }
  }

  /** A confirmed booking whose slot starts `startsInMinutes` from now. */
  async function confirmed(startsInMinutes = 24 * 60) {
    const { w, c, bookingId } = await requested()
    const offer = await pendingOffer(bookingId)
    const b = await bookingRow(bookingId)
    await acceptOffer(w.actor, offer.id, { expectedBookingVersion: b.version })
    // Move the slot so tests can control timing without waiting.
    const start = new Date(Date.now() + startsInMinutes * MIN)
    await sql`update bookings set slot = tstzrange(${start}, ${new Date(start.getTime() + 90 * MIN)}) where id = ${bookingId}`
    return { w, c, bookingId }
  }

  describe('creating a booking request', () => {
    it('creates a request with an invitation, a pending customer offer, history and an outbox event', async () => {
      const w = await world.worker()
      const c = await world.customer()
      const key = world.key()
      const body = world.request(c, w)
      const res = await call(
        createRoute,
        req('/api/v1/bookings', { cookie: c.cookie, body, headers: { 'idempotency-key': key } }),
      )
      expect(res.status).toBe(201)
      const created = await json(res)
      expect(created.code).toMatch(/^KMC-[A-Z0-9]{6}$/)

      const b = await bookingRow(created.bookingId)
      expect(b).toMatchObject({
        status: 'REQUESTED',
        listed_price_paise: 50000,
        commission_bps: 1000,
        worker_id: null,
      })
      expect(b.address_snapshot).toMatchObject({ line1: 'Flat 302, Sai Residency', city: 'Pune' })
      expect(await pendingOffer(b.id)).toMatchObject({
        offered_by: 'CUSTOMER',
        amount_paise: 50000,
      })
      expect(
        await sql`select to_status from booking_status_history where booking_id = ${b.id}`,
      ).toEqual([{ to_status: 'REQUESTED' }])
      expect(await sql`select topic from outbox_events`).toEqual([{ topic: 'booking.requested' }])

      const replay = await call(
        createRoute,
        req('/api/v1/bookings', { cookie: c.cookie, body, headers: { 'idempotency-key': key } }),
      )
      expect(replay.headers.get('idempotent-replayed')).toBe('true')
      expect(await json(replay)).toEqual(created)
      const mismatch = await call(
        createRoute,
        req('/api/v1/bookings', {
          cookie: c.cookie,
          body: { ...body, description: 'x' },
          headers: { 'idempotency-key': key },
        }),
      )
      expect((await json(mismatch)).error.code).toBe('IDEMPOTENCY_MISMATCH')
      expect(await sql`select count(*)::int as n from bookings`).toEqual([{ n: 1 }])
    })

    it('refuses ineligible workers, unreachable addresses and lowball offers', async () => {
      const w = await world.worker({ radiusKm: 3 })
      const c = await world.customer()
      const farCustomer = await world.customer({ farAway: true })
      expect(
        await errorCode(
          createBooking(farCustomer.actor, world.request(farCustomer, w), world.key()),
        ),
      ).toBe('OUT_OF_RANGE')
      expect(
        await errorCode(
          createBooking(
            c.actor,
            world.request(c, w, { priceDecision: { type: 'OFFER', amountPaise: 19000 } }),
            world.key(),
          ),
        ),
      ).toBe('OFFER_BELOW_FLOOR')
      await sql`update worker_profiles set verification_status = 'PENDING' where id = ${w.workerId}`
      expect(await errorCode(createBooking(c.actor, world.request(c, w), world.key()))).toBe(
        'WORKER_UNAVAILABLE',
      )
      await sql`update worker_profiles set verification_status = 'VERIFIED', paused_until = now() + interval '1 day' where id = ${w.workerId}`
      expect(await errorCode(createBooking(c.actor, world.request(c, w), world.key()))).toBe(
        'WORKER_UNAVAILABLE',
      )
    })

    it('checks the slot and suggests alternatives when the worker is busy', async () => {
      const w = await world.worker()
      await sql`delete from worker_availability_rules where worker_id = ${w.workerId}`
      await sql`insert into worker_availability_rules (worker_id, weekday, start_minute, end_minute)
        select ${w.workerId}, d, 540, 1080 from generate_series(0, 6) d`
      const c = await world.customer()
      const midnight = new Date(world.tomorrow())
      midnight.setUTCHours(20, 0, 0, 0) // 01:30 IST: outside 09:00–18:00
      try {
        await createBooking(
          c.actor,
          world.request(c, w, { requestedStart: midnight.toISOString() }),
          world.key(),
        )
        expect.unreachable()
      } catch (e) {
        expect(e).toMatchObject({ code: 'SLOT_TAKEN', status: 409 })
        expect(
          (e as { details: { alternatives: string[] } }).details.alternatives.length,
        ).toBeGreaterThan(0)
      }
    })

    it('limits open requests: one per professional, three in total; on-demand needs an online worker', async () => {
      const c = await world.customer()
      const workers = await Promise.all([1, 2, 3, 4].map(() => world.worker()))
      await createBooking(c.actor, world.request(c, workers[0]), world.key())
      expect(
        await errorCode(createBooking(c.actor, world.request(c, workers[0]), world.key())),
      ).toBe('DUPLICATE_REQUEST')
      await createBooking(c.actor, world.request(c, workers[1]), world.key())
      await createBooking(c.actor, world.request(c, workers[2]), world.key())
      expect(
        await errorCode(createBooking(c.actor, world.request(c, workers[3]), world.key())),
      ).toBe('TOO_MANY_OPEN_REQUESTS')

      const offline = await world.worker({ online: false })
      const c2 = await world.customer()
      expect(
        await errorCode(
          createBooking(
            c2.actor,
            world.request(c2, offline, { timing: 'ON_DEMAND', requestedStart: undefined }),
            world.key(),
          ),
        ),
      ).toBe('WORKER_UNAVAILABLE')
    })

    it('only lets customers book, and only with their own address', async () => {
      const w = await world.worker()
      const c = await world.customer()
      const other = await world.customer()
      expect(await errorCode(createBooking(c.actor, world.request(other, w), world.key()))).toBe(
        'NOT_FOUND',
      )
      const asWorker = await call(
        createRoute,
        req('/api/v1/bookings', {
          cookie: w.cookie,
          body: world.request(c, w),
          headers: { 'idempotency-key': world.key() },
        }),
      )
      expect(asWorker.status).toBe(403)
    })
  })

  describe('negotiation', () => {
    it('runs offer, counter and accept, locking the agreed price', async () => {
      const w = await world.worker()
      const c = await world.customer()
      const { bookingId } = await createBooking(
        c.actor,
        world.request(c, w, { priceDecision: { type: 'OFFER', amountPaise: 40000 } }),
        world.key(),
      )

      // Worker counters ₹460: the customer's offer becomes COUNTERED and the booking NEGOTIATING.
      await makeOffer(w.actor, bookingId, { amountPaise: 46000, note: 'Includes a new washer' })
      expect((await bookingRow(bookingId)).status).toBe('NEGOTIATING')
      expect(await errorCode(makeOffer(w.actor, bookingId, { amountPaise: 45000 }))).toBe(
        'NOT_YOUR_TURN',
      )
      expect(await errorCode(makeOffer(c.actor, bookingId, { amountPaise: 39000 }))).toBe(
        'OFFER_NOT_MONOTONIC',
      )
      await makeOffer(c.actor, bookingId, { amountPaise: 44000 })

      const offer = await pendingOffer(bookingId)
      expect(
        await errorCode(
          acceptOffer(c.actor, offer.id, {
            expectedBookingVersion: (await bookingRow(bookingId)).version,
          }),
        ),
      ).toBe('NOT_YOUR_OFFER')
      expect(await errorCode(acceptOffer(w.actor, offer.id, { expectedBookingVersion: 1 }))).toBe(
        'STALE_VERSION',
      )

      const res = await call(
        acceptRoute,
        req(`/api/v1/offers/${offer.id}/accept`, {
          cookie: w.cookie,
          body: { expectedBookingVersion: (await bookingRow(bookingId)).version },
          headers: { 'idempotency-key': world.key() },
        }),
        withId(offer.id),
      )
      expect(res.status).toBe(200)
      const b = await bookingRow(bookingId)
      expect(b).toMatchObject({
        status: 'CONFIRMED',
        agreed_price_paise: 44000,
        worker_id: w.workerId,
        accepted_offer_id: offer.id,
      })
      expect(b.slot).toBeTruthy()

      const statuses =
        await sql`select offered_by, amount_paise, status from price_offers where booking_id = ${bookingId} order by round`
      expect(statuses.map((o) => o.status)).toEqual(['COUNTERED', 'COUNTERED', 'ACCEPTED'])

      // The price is locked by the database, whatever the code does.
      const locked =
        await sql`update bookings set agreed_price_paise = 1 where id = ${bookingId}`.catch(
          (e) => e,
        )
      expect(locked.code).toBe(PG.restrictViolation)

      // The customer sees the start code; the worker sees the full address only now.
      const view = await getCustomerBooking(c.actor, bookingId)
      expect(view.startCode).toBe(deriveStartCode(bookingId, authSecret()))
      const [inv] = await sql`select id from booking_invitations where booking_id = ${bookingId}`
      const workerView = await getWorkerRequest(w.actor, inv.id)
      expect(workerView.address).toMatchObject({ line1: 'Flat 302, Sai Residency' })
      expect(JSON.stringify(workerView)).not.toMatch(/Sharma|startCode"?:"\d/)
    })

    it('enforces fixed prices, the round limit and verified-only quoting', async () => {
      const w = await world.worker({ negotiable: false })
      const c = await world.customer()
      expect(
        await errorCode(
          createBooking(
            c.actor,
            world.request(c, w, { priceDecision: { type: 'OFFER', amountPaise: 45000 } }),
            world.key(),
          ),
        ),
      ).toBe('NOT_NEGOTIABLE')

      const {
        w: w2,
        c: c2,
        bookingId,
      } = await requested({ priceDecision: { type: 'OFFER', amountPaise: 30000 } })
      await makeOffer(w2.actor, bookingId, { amountPaise: 48000 })
      await makeOffer(c2.actor, bookingId, { amountPaise: 32000 })
      await makeOffer(w2.actor, bookingId, { amountPaise: 47000 })
      await makeOffer(c2.actor, bookingId, { amountPaise: 34000 })
      await makeOffer(w2.actor, bookingId, { amountPaise: 46000 })
      expect(await errorCode(makeOffer(c2.actor, bookingId, { amountPaise: 36000 }))).toBe(
        'ROUND_LIMIT',
      )

      const { w: w3, bookingId: b3 } = await requested()
      await sql`update worker_profiles set verification_status = 'SUSPENDED' where id = ${w3.workerId}`
      expect(await errorCode(makeOffer(w3.actor, b3, { amountPaise: 45000 }))).toBe('NOT_VERIFIED')
      const o3 = await pendingOffer(b3)
      expect(
        await errorCode(
          acceptOffer(w3.actor, o3.id, { expectedBookingVersion: (await bookingRow(b3)).version }),
        ),
      ).toBe('WORKER_UNAVAILABLE')
    })

    it('expires offers and requests lazily and through the sweeper', async () => {
      const { w, bookingId } = await requested()
      const offer = await pendingOffer(bookingId)
      const later = new Date(Date.now() + 7 * 3_600_000) // past the 6-hour offer expiry
      expect(
        await errorCode(acceptOffer(w.actor, offer.id, { expectedBookingVersion: 1 }, later)),
      ).toBe('EXPIRED')
      expect((await sql`select status from price_offers where id = ${offer.id}`)[0].status).toBe(
        'EXPIRED',
      )

      await sql`update bookings set expires_at = now() - interval '1 minute' where id = ${bookingId}`
      const denied = await call(
        sweepRoute,
        req('/api/internal/sweep', { body: {}, headers: { authorization: 'Bearer wrong' } }),
      )
      expect(denied.status).toBe(403)
      const ok = await call(
        sweepRoute,
        req('/api/internal/sweep', {
          body: {},
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        }),
      )
      expect(ok.status).toBe(200)
      expect((await json(ok)).expired.bookings).toBe(1)
      expect((await bookingRow(bookingId)).status).toBe('EXPIRED')
      expect(
        await sql`select to_status, actor_role from booking_status_history where booking_id = ${bookingId} order by id desc limit 1`,
      ).toEqual([{ to_status: 'EXPIRED', actor_role: 'SYSTEM' }])
    })

    it('rejects, withdraws and declines', async () => {
      const { w, c, bookingId } = await requested()
      const first = await pendingOffer(bookingId)
      await rejectOffer(w.actor, first.id, {})
      const b = await bookingRow(bookingId)
      expect(b.status).toBe('NEGOTIATING')
      expect(new Date(b.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(10 * MIN + 1000)

      const { offerId } = await makeOffer(c.actor, bookingId, { amountPaise: 50000 })
      expect(await errorCode(withdrawOffer(w.actor, offerId))).toBe('NOT_FOUND')
      await withdrawOffer(c.actor, offerId)

      const { w: w2, bookingId: b2 } = await requested()
      const [inv] = await sql`select id from booking_invitations where booking_id = ${b2}`
      await declineRequest(w2.actor, inv.id, { reason: 'Away that day' })
      expect(await bookingRow(b2)).toMatchObject({ status: 'CANCELLED', cancelled_by: 'SYSTEM' })
    })

    it('masks contact details in messages and hides threads from outsiders', async () => {
      const { w, c, bookingId } = await requested()
      const msg = await postMessage(c.actor, bookingId, {
        body: 'Call me at 98765 43210 or pay priya@okicici',
      })
      expect(msg).toMatchObject({ body: 'Call me at [hidden] or pay [hidden]', redacted: true })
      await postMessage(w.actor, bookingId, { body: 'Will bring a spanner' })

      const stranger = await world.customer()
      const otherWorker = await world.worker()
      expect(await errorCode(getCustomerBooking(stranger.actor, bookingId))).toBe('NOT_FOUND')
      expect(await errorCode(makeOffer(otherWorker.actor, bookingId, { amountPaise: 45000 }))).toBe(
        'NOT_FOUND',
      )
      expect(await errorCode(postMessage(stranger.actor, bookingId, { body: 'hi' }))).toBe(
        'NOT_FOUND',
      )
      const res = await call(
        getBookingRoute,
        req('/', { cookie: stranger.cookie }),
        withId(bookingId),
      )
      expect(res.status).toBe(404)

      // The worker inbox never shows the address or the customer's surname.
      const inbox = await json(
        await call(
          workerRequestsRoute,
          req('/api/v1/worker/requests?state=new', { cookie: w.cookie }),
        ),
      )
      expect(inbox.requests).toHaveLength(1)
      const [inv] = await sql`select id from booking_invitations where booking_id = ${bookingId}`
      const detail = await json(
        await call(workerRequestRoute, req('/', { cookie: w.cookie }), withId(inv.id)),
      )
      expect(detail.request.address).toBeNull()
      expect(detail.request.customerFirstName).toBe('Priya')
      expect(JSON.stringify(detail)).not.toMatch(/Sharma|Sai Residency/)
      expect(
        (await sql`select status from booking_invitations where id = ${inv.id}`)[0].status,
      ).toBe('SEEN')
      expect(
        (await call(workerRequestRoute, req('/', { cookie: otherWorker.cookie }), withId(inv.id)))
          .status,
      ).toBe(404)
    })
  })

  describe('job lifecycle', () => {
    it('moves a job from confirmed to completed with the start code and approved extras', async () => {
      const { w, c, bookingId } = await confirmed(60)
      const version = async () => (await bookingRow(bookingId)).version
      const step = async (to: string, extra: Record<string, unknown> = {}) =>
        transition(w.actor, bookingId, { to, expectedVersion: await version(), ...extra })

      await step('EN_ROUTE')
      await step('ARRIVED')
      const code = deriveStartCode(bookingId, authSecret())
      const wrong = code === '0000' ? '1111' : '0000'
      for (let i = 4; i >= 1; i--) {
        const e = await step('IN_PROGRESS', { startCode: wrong }).catch((err) => err)
        expect(e).toMatchObject({ code: 'START_CODE_INVALID', details: { attemptsLeft: i } })
      }
      await step('IN_PROGRESS', { startCode: code })
      expect((await bookingRow(bookingId)).started_at).toBeTruthy()

      const { chargeId } = await proposeCharge(w.actor, bookingId, {
        kind: 'MATERIALS',
        description: 'New tap cartridge',
        amountPaise: 15000,
      })
      expect(await errorCode(step('COMPLETED'))).toBe('CHARGES_PENDING')
      expect(await errorCode(decideCharge(w.actor, chargeId, 'APPROVED'))).toBe('FORBIDDEN')
      const res = await call(
        approveChargeRoute,
        req('/', { cookie: c.cookie, body: {} }),
        withId(chargeId),
      )
      expect(res.status).toBe(200)
      const b = await bookingRow(bookingId)
      expect(b).toMatchObject({ approved_charges_paise: 15000, final_amount_paise: 65000 })

      await step('COMPLETED')
      expect(await bookingRow(bookingId)).toMatchObject({ status: 'COMPLETED' })
      expect(
        (await sql`select completed_jobs from worker_profiles where id = ${w.workerId}`)[0]
          .completed_jobs,
      ).toBe(1)
      const history =
        await sql`select to_status from booking_status_history where booking_id = ${bookingId} order by id`
      expect(history.map((h) => h.to_status)).toEqual([
        'REQUESTED',
        'CONFIRMED',
        'EN_ROUTE',
        'ARRIVED',
        'IN_PROGRESS',
        'IN_PROGRESS',
        'COMPLETED',
      ])
    })

    it('locks the job after five wrong start codes', async () => {
      const { w, bookingId } = await confirmed(30)
      await sql`update bookings set status = 'ARRIVED', start_code_attempts = 4 where id = ${bookingId}`
      const v = (await bookingRow(bookingId)).version
      const code = deriveStartCode(bookingId, authSecret())
      const wrong = code === '0000' ? '1111' : '0000'
      expect(
        await errorCode(
          transition(w.actor, bookingId, {
            to: 'IN_PROGRESS',
            startCode: wrong,
            expectedVersion: v,
          }),
        ),
      ).toBe('START_CODE_LOCKED')
      expect(
        await errorCode(
          transition(w.actor, bookingId, {
            to: 'IN_PROGRESS',
            startCode: code,
            expectedVersion: v,
          }),
        ),
      ).toBe('START_CODE_LOCKED')
    })

    it('refuses to set off for a scheduled job too early', async () => {
      const { w, bookingId } = await confirmed(24 * 60)
      expect(
        await errorCode(
          transition(w.actor, bookingId, {
            to: 'EN_ROUTE',
            expectedVersion: (await bookingRow(bookingId)).version,
          }),
        ),
      ).toBe('TOO_EARLY')
    })

    it('allows exactly the transitions in the state-machine table', async () => {
      const { w, bookingId } = await confirmed(30)
      const code = deriveStartCode(bookingId, authSecret())
      const assigned: BookingStatus[] = BOOKING_STATUSES.filter(
        (s) => !['REQUESTED', 'NEGOTIATING', 'EXPIRED'].includes(s),
      )
      for (const from of assigned) {
        for (const to of ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'] as const) {
          const [{ version }] = await sql`
            update bookings set status = ${from}, start_code_attempts = 0,
              completed_at = ${from === 'COMPLETED' ? new Date() : null},
              cancelled_at = ${from === 'CANCELLED' ? new Date() : null},
              cancelled_by = ${from === 'CANCELLED' ? 'CUSTOMER' : null}
            where id = ${bookingId} returning version`
          const result = await errorCode(
            transition(w.actor, bookingId, { to, startCode: code, expectedVersion: version }),
          )
          expect([from, to, result]).toEqual([
            from,
            to,
            WORKER_STEPS[from] === to ? 'OK' : 'INVALID_TRANSITION',
          ])
        }
      }
    })

    it('applies the cancellation policy', async () => {
      const free = await confirmed(60)
      const r1 = await cancelBooking(free.c.actor, free.bookingId, {
        expectedVersion: (await bookingRow(free.bookingId)).version,
      })
      expect(r1).toMatchObject({ status: 'CANCELLED' })
      expect(r1).not.toHaveProperty('visitFeePaise')

      const late = await confirmed(60)
      await sql`update bookings set status = 'EN_ROUTE' where id = ${late.bookingId}`
      const r2 = await cancelBooking(late.c.actor, late.bookingId, {
        expectedVersion: (await bookingRow(late.bookingId)).version,
      })
      expect(r2).toMatchObject({ visitFeePaise: 9900 })

      const started = await confirmed(60)
      await sql`update bookings set status = 'IN_PROGRESS', started_at = now() where id = ${started.bookingId}`
      expect(
        await errorCode(
          cancelBooking(started.c.actor, started.bookingId, {
            expectedVersion: (await bookingRow(started.bookingId)).version,
          }),
        ),
      ).toBe('INVALID_TRANSITION')

      const byWorker = await confirmed(60)
      const v = (await bookingRow(byWorker.bookingId)).version
      expect(
        await errorCode(
          cancelBooking(byWorker.w.actor, byWorker.bookingId, { expectedVersion: v }),
        ),
      ).toBe('VALIDATION_FAILED')
      await cancelBooking(byWorker.w.actor, byWorker.bookingId, {
        reason: 'Unwell today',
        expectedVersion: v,
      })
      expect(
        (
          await sql`select cancellations_by_worker from worker_profiles where id = ${byWorker.w.workerId}`
        )[0].cancellations_by_worker,
      ).toBe(1)

      const noShow = await confirmed(30)
      const nv = (await bookingRow(noShow.bookingId)).version
      await transition(noShow.w.actor, noShow.bookingId, { to: 'EN_ROUTE', expectedVersion: nv })
      await transition(noShow.w.actor, noShow.bookingId, { to: 'ARRIVED', expectedVersion: nv + 1 })
      expect(
        await errorCode(
          cancelBooking(noShow.w.actor, noShow.bookingId, {
            reason: 'Customer not home',
            expectedVersion: nv + 2,
          }),
        ),
      ).toBe('NO_SHOW_TOO_EARLY')
      const r3 = await cancelBooking(
        noShow.w.actor,
        noShow.bookingId,
        { reason: 'Customer not home', expectedVersion: nv + 2 },
        new Date(Date.now() + 21 * MIN),
      )
      expect(r3).toMatchObject({ status: 'CANCELLED', noShow: true })
    })
  })
})
