import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as invoiceRoute } from '@/app/api/v1/bookings/[id]/invoice/route'
import { POST as payRoute } from '@/app/api/v1/bookings/[id]/payments/route'
import { POST as reviewRoute } from '@/app/api/v1/bookings/[id]/review/route'
import { POST as confirmCashRoute } from '@/app/api/v1/payments/[id]/confirm-cash/route'
import { POST as simulateRoute } from '@/app/api/v1/payments/[id]/simulate/route'
import { GET as summaryRoute } from '@/app/api/v1/worker/earnings/summary/route'
import { GET as ledgerRoute } from '@/app/api/v1/worker/ledger/route'
import { createBooking } from '@/modules/bookings/create'
import { cancelBooking, transition } from '@/modules/bookings/lifecycle'
import { acceptOffer } from '@/modules/negotiation/offers'
import { commissionOf } from '@/modules/ledger/postings'
import { earningsSummary, listLedger } from '@/modules/ledger/earnings'
import { dispatchOutbox } from '@/modules/notifications/dispatcher'
import { createReview, reviewState } from '@/modules/reviews/reviews'
import { call, json, req, userWithSession, withId } from '@/test/api'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import { bookingPayment, startPayment } from './payments'
import { financialYear } from './receipts'

const DAY = 86_400_000

describe.skipIf(!hasTestDatabase)('payments, ledger, receipts and reviews', () => {
  const sql = connectTestDb()
  let world: Awaited<ReturnType<typeof bookingWorld>>

  beforeEach(async () => {
    await truncateAll(sql)
    world = await bookingWorld(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  type W = Awaited<ReturnType<typeof world.worker>>
  type C = Awaited<ReturnType<typeof world.customer>>

  /** A completed job at the listed ₹500, plus an approved ₹150 extra when asked. */
  const completed = (w?: W, c?: C, extraPaise = 0) => world.completed(w, c, extraPaise)

  const pay = (cookie: string, bookingId: string, body: unknown, key = world.key()) =>
    call(
      payRoute,
      req('/', { cookie, body, headers: { 'idempotency-key': key } }),
      withId(bookingId),
    )
  const ledger = (workerId: string) =>
    sql`select type, amount_paise from worker_ledger_entries where worker_id = ${workerId} order by id`

  describe('simulated online payment', () => {
    it('charges the booking total, survives a failure and posts the ledger once', async () => {
      const { w, c, bookingId } = await completed(undefined, undefined, 15_000)
      const key = world.key()
      // The amount in the request is ignored: the booking decides.
      const res = await pay(c.cookie, bookingId, { method: 'SIMULATED', amountPaise: 1 }, key)
      expect(res.status).toBe(201)
      const { payment } = await json(res)
      expect(payment).toMatchObject({ amountPaise: 65_000, status: 'PENDING', simulated: true })
      // A retried request with the same key replays the same payment.
      const replay = await pay(c.cookie, bookingId, { method: 'SIMULATED', amountPaise: 1 }, key)
      expect((await json(replay)).payment.id).toBe(payment.id)
      expect((await bookingPayment(bookingId)).state).toBe('AWAITING_SIMULATED')

      const failed = await call(
        simulateRoute,
        req('/', { cookie: c.cookie, body: { outcome: 'failure' } }),
        withId(payment.id),
      )
      expect((await json(failed)).payment.status).toBe('FAILED')
      expect(await bookingPayment(bookingId)).toMatchObject({
        state: 'UNPAID',
        lastFailure: expect.stringMatching(/Simulated failure/),
      })
      expect(await ledger(w.workerId)).toEqual([])

      const retry = (await json(await pay(c.cookie, bookingId, { method: 'SIMULATED' }))).payment
      const ok = await call(
        simulateRoute,
        req('/', { cookie: c.cookie, body: { outcome: 'success' } }),
        withId(retry.id),
      )
      expect((await json(ok)).payment).toMatchObject({ status: 'CAPTURED' })
      expect(await ledger(w.workerId)).toEqual([
        { type: 'JOB_EARNING', amount_paise: 65_000 },
        { type: 'COMMISSION', amount_paise: -6_500 },
      ])
      const state = await bookingPayment(bookingId)
      expect(state).toMatchObject({
        state: 'PAID',
        receiptNumber: `KMC/${financialYear(new Date())}/000001`,
      })

      const again = await call(
        simulateRoute,
        req('/', { cookie: c.cookie, body: { outcome: 'success' } }),
        withId(retry.id),
      )
      expect((await json(again)).error.code).toBe('PAYMENT_NOT_PENDING')
      expect((await json(await pay(c.cookie, bookingId, { method: 'CASH' }))).error.code).toBe(
        'ALREADY_PAID',
      )

      await dispatchOutbox()
      expect(
        await sql`select title, link from notifications where user_id = ${w.userId} and type = 'payment.captured'`,
      ).toEqual([{ title: 'Priya paid ₹650 online', link: '/worker/earnings' }])
    })

    it('is only for the booking’s customer, after completion', async () => {
      const w = await world.worker()
      const c = await world.customer()
      const { bookingId } = await createBooking(c.actor, world.request(c, w), world.key())
      expect((await json(await pay(c.cookie, bookingId, { method: 'SIMULATED' }))).error.code).toBe(
        'NOT_PAYABLE',
      )
      const done = await completed()
      const stranger = await world.customer()
      expect((await pay(stranger.cookie, done.bookingId, { method: 'SIMULATED' })).status).toBe(404)
      expect((await pay(done.w.cookie, done.bookingId, { method: 'SIMULATED' })).status).toBe(403)
      expect(
        (await json(await pay(done.c.cookie, done.bookingId, { method: 'RAZORPAY' }))).error.code,
      ).toBe('PAYMENT_METHOD_UNAVAILABLE')
      expect((await pay(done.c.cookie, done.bookingId, { method: 'CHEQUE' })).status).toBe(400)
    })
  })

  describe('cash', () => {
    it('waits for the professional to confirm, then leaves the fee owed', async () => {
      const { w, c, bookingId } = await completed()
      // Switching from an unfinished online attempt to cash replaces it.
      const online = (await json(await pay(c.cookie, bookingId, { method: 'SIMULATED' }))).payment
      const { payment } = await json(await pay(c.cookie, bookingId, { method: 'CASH' }))
      expect((await sql`select status from payments where id = ${online.id}`)[0].status).toBe(
        'CANCELLED',
      )
      expect((await bookingPayment(bookingId)).state).toBe('AWAITING_CASH')

      // Only the assigned professional confirms; not the customer, not another professional.
      expect(
        (await call(confirmCashRoute, req('/', { cookie: c.cookie, body: {} }), withId(payment.id)))
          .status,
      ).toBe(403)
      const other = await world.worker()
      expect(
        (
          await call(
            confirmCashRoute,
            req('/', { cookie: other.cookie, body: {} }),
            withId(payment.id),
          )
        ).status,
      ).toBe(404)
      // The customer cannot "simulate" a cash payment into being paid.
      expect(
        (
          await call(
            simulateRoute,
            req('/', { cookie: c.cookie, body: { outcome: 'success' } }),
            withId(payment.id),
          )
        ).status,
      ).toBe(404)

      const res = await call(
        confirmCashRoute,
        req('/', { cookie: w.cookie, body: {} }),
        withId(payment.id),
      )
      expect((await json(res)).payment.status).toBe('CAPTURED')
      expect(await ledger(w.workerId)).toEqual([
        { type: 'JOB_EARNING', amount_paise: 50_000 },
        { type: 'COMMISSION', amount_paise: -5_000 },
        { type: 'CASH_COLLECTED', amount_paise: -50_000 },
      ])
      expect((await earningsSummary(w.workerId, 'all')).balancePaise).toBe(-5_000)
      await dispatchOutbox()
      const told =
        await sql`select user_id, type from notifications where type like 'payment.%' order by id`
      expect(told).toEqual([
        { user_id: w.userId, type: 'payment.cash_pending' },
        { user_id: c.userId, type: 'payment.captured' },
      ])
    })

    it('captures exactly once when confirmed several times at once', async () => {
      const { w, c, bookingId } = await completed()
      const { payment } = await json(await pay(c.cookie, bookingId, { method: 'CASH' }))
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          call(confirmCashRoute, req('/', { cookie: w.cookie, body: {} }), withId(payment.id)),
        ),
      )
      expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409])
      expect(await ledger(w.workerId)).toHaveLength(3)
      expect(await sql`select count(*)::int as n from invoices`).toEqual([{ n: 1 }])
    })
  })

  describe('visit fee', () => {
    /** A ₹500 job the customer cancels once the professional has set off (or before, if `free`). */
    async function cancelled(free = false) {
      const w = await world.worker()
      const c = await world.customer()
      const { bookingId } = await createBooking(c.actor, world.request(c, w), world.key())
      const [offer] = await sql`select id from price_offers where booking_id = ${bookingId}`
      await acceptOffer(w.actor, offer.id, {
        expectedBookingVersion: await world.version(bookingId),
      })
      if (!free) {
        // Setting off is only allowed close to the slot, so start it now.
        await sql`update bookings set slot = tstzrange(now(), now() + interval '2 hours') where id = ${bookingId}`
        await transition(w.actor, bookingId, {
          to: 'EN_ROUTE',
          expectedVersion: await world.version(bookingId),
        })
      }
      await cancelBooking(c.actor, bookingId, { expectedVersion: await world.version(bookingId) })
      return { w, c, bookingId }
    }

    it('is charged on a late cancellation, paid like a job and posted to the ledger', async () => {
      const { w, c, bookingId } = await cancelled()
      expect((await sql`select visit_fee_paise from bookings where id = ${bookingId}`)[0]).toEqual({
        visit_fee_paise: 9_900,
      })
      const { payment } = await json(await pay(c.cookie, bookingId, { method: 'CASH' }))
      expect(payment).toMatchObject({ amountPaise: 9_900, status: 'PENDING' })
      const res = await call(
        confirmCashRoute,
        req('/', { cookie: w.cookie, body: {} }),
        withId(payment.id),
      )
      expect((await json(res)).payment.status).toBe('CAPTURED')
      expect(await ledger(w.workerId)).toEqual([
        { type: 'JOB_EARNING', amount_paise: 9_900 },
        { type: 'COMMISSION', amount_paise: -990 },
        { type: 'CASH_COLLECTED', amount_paise: -9_900 },
      ])
      const receipt = (
        await json(await call(invoiceRoute, req('/', { cookie: c.cookie }), withId(bookingId)))
      ).receipt
      expect(receipt).toMatchObject({
        totalPaise: 9_900,
        lineItems: [
          { label: 'Tap repair: visit fee (cancelled after set-off)', amountPaise: 9_900 },
        ],
      })
      await dispatchOutbox()
      expect(
        await sql`select title, body, link from notifications where user_id = ${w.userId} and type = 'booking.cancelled'`,
      ).toEqual([
        {
          title: 'Priya cancelled after you set off',
          body: expect.stringMatching(/owe a ₹99 visit fee$/),
          link: `/worker/bookings/${bookingId}`,
        },
      ])
    })

    it('is not owed when the customer cancels before the professional sets off', async () => {
      const { c, bookingId } = await cancelled(true)
      expect((await sql`select visit_fee_paise from bookings where id = ${bookingId}`)[0]).toEqual({
        visit_fee_paise: null,
      })
      expect((await json(await pay(c.cookie, bookingId, { method: 'CASH' }))).error.code).toBe(
        'NOT_PAYABLE',
      )
    })
  })

  describe('receipts', () => {
    it('numbers receipts in sequence and shows the fee only to the professional and admins', async () => {
      const w = await world.worker()
      const first = await completed(w, undefined, 15_000)
      const second = await completed(w)
      for (const job of [first, second]) {
        const started = await json(await pay(job.c.cookie, job.bookingId, { method: 'CASH' }))
        const r = await call(
          confirmCashRoute,
          req('/', { cookie: w.cookie, body: {} }),
          withId(started.payment.id),
        )
        expect(r.status).toBe(200)
      }
      const numbers = (await sql`select number from invoices order by issued_at`).map(
        (r) => r.number,
      )
      const fy = financialYear(new Date())
      expect(numbers).toEqual([`KMC/${fy}/000001`, `KMC/${fy}/000002`])

      const asCustomer = (
        await json(
          await call(invoiceRoute, req('/', { cookie: first.c.cookie }), withId(first.bookingId)),
        )
      ).receipt
      expect(asCustomer).toMatchObject({
        viewer: 'customer',
        totalPaise: 65_000,
        paidWith: 'Cash',
        platformFeePaise: null,
        lineItems: [
          { label: 'Tap repair (agreed price)', amountPaise: 50_000 },
          { label: 'Extra: New washer', amountPaise: 15_000 },
        ],
      })
      const asWorker = (
        await json(
          await call(invoiceRoute, req('/', { cookie: w.cookie }), withId(first.bookingId)),
        )
      ).receipt
      expect(asWorker).toMatchObject({
        viewer: 'worker',
        platformFeePaise: commissionOf(65_000, 1000),
      })
      const admin = await userWithSession(sql, { role: 'ADMIN' })
      expect(
        (
          await json(
            await call(invoiceRoute, req('/', { cookie: admin.cookie }), withId(first.bookingId)),
          )
        ).receipt.viewer,
      ).toBe('admin')
      expect(
        (await call(invoiceRoute, req('/', { cookie: second.c.cookie }), withId(first.bookingId)))
          .status,
      ).toBe(404)
      // Receipts are immutable.
      await expect(sql`update invoices set total_paise = 1`).rejects.toThrow()
    })
  })

  describe('reviews', () => {
    it('takes one review per completed job and updates the rating', async () => {
      const { w, c, bookingId } = await completed()
      const post = (body: unknown, cookie = c.cookie) =>
        call(
          reviewRoute,
          req('/', { cookie, body, headers: { 'idempotency-key': world.key() } }),
          withId(bookingId),
        )

      expect((await post({ rating: 6 })).status).toBe(400)
      expect((await post({ rating: 5, tags: ['magic'] })).status).toBe(400)
      expect((await post({ rating: 5 }, (await world.customer()).cookie)).status).toBe(404)
      const res = await post({
        rating: 4,
        tags: ['on_time', 'polite', 'on_time'],
        comment: '  Quick fix  ',
      })
      expect(res.status).toBe(201)
      expect((await json(res)).review).toMatchObject({
        rating: 4,
        tags: ['on_time', 'polite'],
        comment: 'Quick fix',
      })
      expect(
        (
          await sql`select rating_sum, rating_count from worker_profiles where id = ${w.workerId}`
        )[0],
      ).toEqual({
        rating_sum: 4,
        rating_count: 1,
      })
      expect((await json(await post({ rating: 1 }))).error.code).toBe('ALREADY_REVIEWED')
      expect((await reviewState(c.actor, bookingId)).canReview).toBe(false)
      await dispatchOutbox()
      expect(
        await sql`select title from notifications where user_id = ${w.userId} and type = 'review.created'`,
      ).toEqual([{ title: 'Priya rated you 4★' }])
    })

    it('closes after 14 days and is not open before completion', async () => {
      const { c, bookingId } = await completed()
      const late = new Date(Date.now() + 15 * DAY)
      expect((await reviewState(c.actor, bookingId, late)).canReview).toBe(false)
      await expect(createReview(c.actor, bookingId, { rating: 5 }, late)).rejects.toMatchObject({
        code: 'REVIEW_WINDOW_CLOSED',
      })
      const w = await world.worker()
      const c2 = await world.customer()
      const open = await createBooking(c2.actor, world.request(c2, w), world.key())
      await expect(createReview(c2.actor, open.bookingId, { rating: 5 })).rejects.toMatchObject({
        code: 'NOT_REVIEWABLE',
      })
    })
  })

  describe('earnings', () => {
    it('equals the sum of the ledger entries, by period and in total', async () => {
      const w = await world.worker()
      for (const method of ['CASH', 'SIMULATED', 'SIMULATED'] as const) {
        const job = await completed(w)
        const { payment } = await startPayment(job.c.actor, job.bookingId, { method }, world.key())
        if (method === 'CASH') {
          await call(confirmCashRoute, req('/', { cookie: w.cookie, body: {} }), withId(payment.id))
        } else {
          await call(
            simulateRoute,
            req('/', { cookie: job.c.cookie, body: { outcome: 'success' } }),
            withId(payment.id),
          )
        }
      }
      // An older entry and a simulated payout, outside this week.
      await sql`insert into worker_ledger_entries (worker_id, type, amount_paise, description, created_at)
        values (${w.workerId}, 'ADJUSTMENT', 2500, 'Goodwill credit', now() - interval '40 days'),
               (${w.workerId}, 'PAYOUT', -10000, 'Payout (simulated)', now() - interval '40 days')`

      const week = await json(await call(summaryRoute, req('/?period=week', { cookie: w.cookie })))
      expect(week).toMatchObject({
        grossPaise: 150_000,
        commissionPaise: 15_000,
        netPaise: 135_000,
        cashCollectedPaise: 50_000,
        adjustmentsPaise: 0,
        paidOutPaise: 0,
        jobs: 3,
        simulated: true,
      })
      const all = await earningsSummary(w.workerId, 'all')
      const [{ total }] =
        await sql`select sum(amount_paise)::int as total from worker_ledger_entries where worker_id = ${w.workerId}`
      expect(all.balancePaise).toBe(total)
      expect(all.balancePaise).toBe(
        all.netPaise - all.cashCollectedPaise + all.adjustmentsPaise - all.paidOutPaise,
      )
      expect(all).toMatchObject({ adjustmentsPaise: 2_500, paidOutPaise: 10_000 })

      const page = await json(await call(ledgerRoute, req('/', { cookie: w.cookie })))
      expect(page.entries).toHaveLength(9)
      expect(page.entries[0].type).toBe('PAYOUT')
      expect((await listLedger(w.workerId, String(page.entries[3].id))).entries).toHaveLength(5)
      const customer = await world.customer()
      expect((await call(summaryRoute, req('/', { cookie: customer.cookie }))).status).toBe(403)
    })
  })
})
