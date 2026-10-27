import { createHmac, randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as refundRoute } from '@/app/api/v1/admin/payments/[id]/refunds/route'
import { POST as payRoute } from '@/app/api/v1/bookings/[id]/payments/route'
import { POST as confirmRoute } from '@/app/api/v1/payments/[id]/razorpay/route'
import { POST as webhookRoute } from '@/app/api/v1/webhooks/razorpay/route'
import { SESSION_COOKIE_PLAIN } from '@/modules/auth/cookies'
import { createSession } from '@/modules/auth/sessions'
import { call, json, ORIGIN, req, userWithSession, withId } from '@/test/api'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import { bookingPayment } from './payments'

const secrets = vi.hoisted(() => ({
  key: 'rzp_test_kaamico',
  keySecret: 'test-key-secret-0123',
  hookSecret: 'test-webhook-secret-0123',
}))

// This file runs the app in Razorpay test mode.
vi.mock('@/config/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/config/env')>()
  return {
    ...mod,
    getEnv: () => ({
      ...mod.getEnv(),
      PAYMENTS_MODE: 'razorpay',
      RAZORPAY_KEY_ID: secrets.key,
      RAZORPAY_KEY_SECRET: secrets.keySecret,
      RAZORPAY_WEBHOOK_SECRET: secrets.hookSecret,
    }),
  }
})

const hmac = (secret: string, message: string) =>
  createHmac('sha256', secret).update(message).digest('hex')

/** A stand-in for Razorpay's REST API. */
function fakeRazorpay() {
  const calls: { path: string; body: Record<string, unknown>; auth: string | null }[] = []
  let failNext = false
  let n = 0
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = String(url).replace('https://api.razorpay.com/v1', '')
    const body = JSON.parse(String(init?.body ?? '{}'))
    calls.push({ path, body, auth: new Headers(init?.headers).get('authorization') })
    if (failNext) {
      failNext = false
      return Response.json(
        { error: { code: 'BAD_REQUEST_ERROR', description: 'nope' } },
        { status: 400 },
      )
    }
    if (path === '/orders') {
      return Response.json({
        id: `order_${++n}`,
        amount: body.amount,
        currency: 'INR',
        status: 'created',
      })
    }
    if (/^\/payments\/[^/]+\/refund$/.test(path)) {
      return Response.json({ id: `rfnd_${++n}`, amount: body.amount, status: 'pending' })
    }
    return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
  })
  return { fetchMock, calls, failNext: () => (failNext = true) }
}

describe.skipIf(!hasTestDatabase)('Razorpay test mode', () => {
  const sql = connectTestDb()
  let world: Awaited<ReturnType<typeof bookingWorld>>
  let razorpay: ReturnType<typeof fakeRazorpay>

  beforeEach(async () => {
    await truncateAll(sql)
    world = await bookingWorld(sql)
    razorpay = fakeRazorpay()
    vi.stubGlobal('fetch', razorpay.fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  afterAll(async () => {
    await sql.end()
  })

  const pay = (cookie: string, bookingId: string, method: string, key = randomUUID()) =>
    call(
      payRoute,
      req('/', { cookie, body: { method }, headers: { 'idempotency-key': key } }),
      withId(bookingId),
    )

  async function started() {
    const job = await world.completed()
    const res = await pay(job.c.cookie, job.bookingId, 'RAZORPAY')
    expect(res.status).toBe(201)
    const body = await json(res)
    return {
      ...job,
      paymentId: body.payment.id as string,
      orderId: body.checkout.orderId as string,
      body,
    }
  }

  const confirm = (cookie: string, paymentId: string, body: Record<string, string>) =>
    call(confirmRoute, req('/', { cookie, body }), withId(paymentId))

  function webhook(
    event: Record<string, unknown>,
    opts: { eventId?: string; secret?: string } = {},
  ) {
    const raw = JSON.stringify(event)
    return call(
      webhookRoute,
      new Request(`${ORIGIN}/api/v1/webhooks/razorpay`, {
        method: 'POST',
        // Razorpay does not send an Origin header.
        headers: {
          'content-type': 'application/json',
          'x-razorpay-signature': hmac(opts.secret ?? secrets.hookSecret, raw),
          'x-razorpay-event-id': opts.eventId ?? randomUUID(),
        },
        body: raw,
      }),
    )
  }
  const paymentEvent = (event: string, orderId: string, amount: number, id = 'pay_1') => ({
    event,
    created_at: 1_700_000_000,
    payload: {
      payment: { entity: { id, order_id: orderId, amount, error_description: 'Card declined' } },
    },
  })

  const status = async (paymentId: string) =>
    (await sql`select status from payments where id = ${paymentId}`)[0].status as string
  const ledger = async (bookingId: string) =>
    (
      await sql`select coalesce(sum(amount_paise), 0)::int as s from worker_ledger_entries where booking_id = ${bookingId}`
    )[0].s as number

  describe('checkout', () => {
    it('creates one order for the booking total and reuses it on retries', async () => {
      const { body, c, bookingId } = await started()
      expect(body.checkout).toMatchObject({
        keyId: secrets.key,
        amountPaise: 50_000,
        currency: 'INR',
      })
      expect(razorpay.calls).toHaveLength(1)
      expect(razorpay.calls[0].body).toMatchObject({ amount: 50_000, currency: 'INR' })
      expect(razorpay.calls[0].auth).toBe(
        `Basic ${Buffer.from(`${secrets.key}:${secrets.keySecret}`).toString('base64')}`,
      )
      const again = await json(await pay(c.cookie, bookingId, 'RAZORPAY'))
      expect(again.checkout.orderId).toBe(body.checkout.orderId)
      expect(razorpay.calls).toHaveLength(1)
    })

    it('offers no simulated checkout in Razorpay mode', async () => {
      const job = await world.completed()
      const res = await pay(job.c.cookie, job.bookingId, 'SIMULATED')
      expect((await json(res)).error.code).toBe('PAYMENT_METHOD_UNAVAILABLE')
    })

    it('fails the attempt when Razorpay cannot create the order', async () => {
      const job = await world.completed()
      razorpay.failNext()
      const res = await pay(job.c.cookie, job.bookingId, 'RAZORPAY')
      expect(res.status).toBe(502)
      expect((await json(res)).error.code).toBe('PAYMENT_PROVIDER_ERROR')
      expect((await bookingPayment(job.bookingId)).state).toBe('UNPAID')
    })

    it('captures only with a valid Checkout signature, and once', async () => {
      const { c, bookingId, paymentId, orderId } = await started()
      const forged = await confirm(c.cookie, paymentId, {
        razorpay_order_id: orderId,
        razorpay_payment_id: 'pay_42',
        razorpay_signature: hmac('wrong-secret', `${orderId}|pay_42`),
      })
      expect((await json(forged)).error.code).toBe('PAYMENT_SIGNATURE_INVALID')
      expect(await status(paymentId)).toBe('PENDING')

      const genuine = {
        razorpay_order_id: orderId,
        razorpay_payment_id: 'pay_42',
        razorpay_signature: hmac(secrets.keySecret, `${orderId}|pay_42`),
      }
      expect((await confirm(c.cookie, paymentId, genuine)).status).toBe(200)
      expect(await status(paymentId)).toBe('CAPTURED')
      expect(await ledger(bookingId)).toBe(45_000)
      // The webhook for the same payment arrives later: nothing changes.
      const hook = await webhook(paymentEvent('payment.captured', orderId, 50_000, 'pay_42'))
      expect(await json(hook)).toEqual({ status: 'ignored', event: 'payment.captured' })
      expect(await ledger(bookingId)).toBe(45_000)
      const [receipt] = await sql`select number from invoices where booking_id = ${bookingId}`
      expect(receipt.number).toMatch(/^KMC\//)
    })

    it('another customer cannot confirm the payment', async () => {
      const { paymentId, orderId } = await started()
      const other = await world.customer()
      const res = await confirm(other.cookie, paymentId, {
        razorpay_order_id: orderId,
        razorpay_payment_id: 'pay_1',
        razorpay_signature: hmac(secrets.keySecret, `${orderId}|pay_1`),
      })
      expect(res.status).toBe(404)
    })
  })

  describe('webhooks', () => {
    it('capture by webhook alone, deduplicated by event id', async () => {
      const { bookingId, paymentId, orderId } = await started()
      const eventId = randomUUID()
      const first = await webhook(paymentEvent('payment.captured', orderId, 50_000), { eventId })
      expect(await json(first)).toEqual({ status: 'processed', event: 'payment.captured' })
      const replay = await webhook(paymentEvent('payment.captured', orderId, 50_000), { eventId })
      expect(await json(replay)).toEqual({ status: 'duplicate', event: 'payment.captured' })
      expect(await status(paymentId)).toBe('CAPTURED')
      expect(await ledger(bookingId)).toBe(45_000)
      expect(await sql`select 1 from payment_events`).toHaveLength(1)
    })

    it('rejects a bad signature and never captures a different amount', async () => {
      const { paymentId, orderId } = await started()
      const forged = await webhook(paymentEvent('payment.captured', orderId, 50_000), {
        secret: 'guess',
      })
      expect(forged.status).toBe(401)
      expect(await sql`select 1 from payment_events`).toHaveLength(0)
      await webhook(paymentEvent('payment.captured', orderId, 100))
      expect(await status(paymentId)).toBe('PENDING')
    })

    it('records a failed payment so the customer can try again', async () => {
      const { bookingId, paymentId, orderId } = await started()
      await webhook(paymentEvent('payment.failed', orderId, 50_000))
      expect(await status(paymentId)).toBe('FAILED')
      expect((await bookingPayment(bookingId)).lastFailure).toBe('Card declined')
    })
  })

  describe('refunds', () => {
    async function captured() {
      const s = await started()
      await webhook(paymentEvent('payment.captured', s.orderId, 50_000, 'pay_9'))
      const a = await userWithSession(sql, { role: 'ADMIN' })
      const { token } = await createSession({
        userId: a.userId,
        scope: 'ADMIN',
        ip: null,
        userAgent: null,
      })
      return { ...s, adminCookie: `${SESSION_COOKIE_PLAIN}=${token}` }
    }
    const refund = (cookie: string, paymentId: string, amountPaise: number) =>
      call(
        refundRoute,
        req('/', {
          cookie,
          body: { amountPaise, reason: 'Late arrival goodwill.' },
          headers: { 'idempotency-key': randomUUID() },
        }),
        withId(paymentId),
      )

    it('sends the refund to Razorpay and completes it on refund.processed', async () => {
      const { bookingId, paymentId, adminCookie } = await captured()
      const res = await refund(adminCookie, paymentId, 10_000)
      expect(res.status).toBe(201)
      expect(await json(res)).toMatchObject({ status: 'REQUESTED', keptPaise: 40_000 })
      expect(razorpay.calls.at(-1)).toMatchObject({
        path: '/payments/pay_9/refund',
        body: { amount: 10_000 },
      })
      const [r] = await sql`select provider_refund_id, status from refunds`
      expect(r.status).toBe('REQUESTED')
      expect(await ledger(bookingId)).toBe(36_000)

      await webhook({
        event: 'refund.processed',
        payload: {
          refund: { entity: { id: r.provider_refund_id, payment_id: 'pay_9', amount: 10_000 } },
        },
      })
      expect((await sql`select status from refunds`)[0].status).toBe('PROCESSED')
      expect(await status(paymentId)).toBe('PARTIALLY_REFUNDED')
    })

    it('undoes a refund Razorpay refuses, at once or later by webhook', async () => {
      const { bookingId, paymentId, adminCookie } = await captured()
      razorpay.failNext()
      const refused = await refund(adminCookie, paymentId, 10_000)
      expect(refused.status).toBe(502)
      expect((await sql`select status from refunds`)[0].status).toBe('FAILED')
      expect(await status(paymentId)).toBe('CAPTURED')
      expect(await ledger(bookingId)).toBe(45_000)

      expect((await refund(adminCookie, paymentId, 20_000)).status).toBe(201)
      const [r] = await sql`select provider_refund_id from refunds where status = 'REQUESTED'`
      await webhook({
        event: 'refund.failed',
        payload: {
          refund: { entity: { id: r.provider_refund_id, payment_id: 'pay_9', amount: 20_000 } },
        },
      })
      expect(await sql`select 1 from refunds where status = 'FAILED'`).toHaveLength(2)
      expect(await status(paymentId)).toBe('CAPTURED')
      expect(await ledger(bookingId)).toBe(45_000)
      // A failed refund no longer counts towards the cap.
      expect((await refund(adminCookie, paymentId, 50_000)).status).toBe(201)
    })
  })
})
