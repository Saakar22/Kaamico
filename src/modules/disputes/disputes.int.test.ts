import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as resolveRoute } from '@/app/api/v1/admin/disputes/[id]/resolve/route'
import { GET as adminDisputesRoute } from '@/app/api/v1/admin/disputes/route'
import { POST as refundRoute } from '@/app/api/v1/admin/payments/[id]/refunds/route'
import { PATCH as ticketStatusRoute } from '@/app/api/v1/admin/support/tickets/[id]/route'
import { POST as raiseRoute } from '@/app/api/v1/bookings/[id]/disputes/route'
import { POST as evidenceRoute } from '@/app/api/v1/disputes/[id]/evidence/route'
import { POST as messageRoute } from '@/app/api/v1/support/tickets/[id]/messages/route'
import { GET as ticketRoute } from '@/app/api/v1/support/tickets/[id]/route'
import { POST as createTicketRoute } from '@/app/api/v1/support/tickets/route'
import { SESSION_COOKIE_PLAIN } from '@/modules/auth/cookies'
import { createSession } from '@/modules/auth/sessions'
import { transition } from '@/modules/bookings/lifecycle'
import { dispatchOutbox } from '@/modules/notifications/dispatcher'
import { bookingPayment, simulatePayment, startPayment } from '@/modules/payments/payments'
import { call, json, req, userWithSession, withId } from '@/test/api'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'

describe.skipIf(!hasTestDatabase)('disputes, refunds and support', () => {
  const sql = connectTestDb()
  let world: Awaited<ReturnType<typeof bookingWorld>>

  beforeEach(async () => {
    await truncateAll(sql)
    world = await bookingWorld(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  async function admin() {
    const a = await userWithSession(sql, { role: 'ADMIN' })
    const { token } = await createSession({
      userId: a.userId,
      scope: 'ADMIN',
      ip: null,
      userAgent: null,
    })
    return { ...a, cookie: `${SESSION_COOKIE_PLAIN}=${token}` }
  }

  type Job = Awaited<ReturnType<typeof world.completed>>

  /** A completed job (₹500), paid online (simulated) unless told otherwise. */
  async function job({ paid = true } = {}) {
    const j = await world.completed()
    if (paid) {
      const { payment } = await startPayment(
        j.c.actor,
        j.bookingId,
        { method: 'SIMULATED' },
        randomUUID(),
      )
      await simulatePayment(j.c.actor, payment.id, { outcome: 'success' })
    }
    return j
  }

  const raise = (cookie: string, bookingId: string, body: unknown, key = randomUUID()) =>
    call(
      raiseRoute,
      req('/', { cookie, body, headers: { 'idempotency-key': key } }),
      withId(bookingId),
    )

  const problem = { reason: 'POOR_QUALITY', description: 'The tap still leaks after the repair.' }

  async function disputed(j: Job) {
    const res = await raise(j.c.cookie, j.bookingId, problem)
    expect(res.status).toBe(201)
    return (await json(res)).disputeId as string
  }

  const resolve = async (cookie: string, disputeId: string, body: Record<string, unknown>) => {
    const [d] = await sql`select version from disputes where id = ${disputeId}`
    return call(
      resolveRoute,
      req('/', {
        cookie,
        body: { expectedVersion: d.version, note: 'Checked the photos and the history.', ...body },
      }),
      withId(disputeId),
    )
  }

  const bookingStatus = async (id: string) =>
    (await sql`select status from bookings where id = ${id}`)[0].status as string
  const ledgerSum = async (bookingId: string) =>
    (
      await sql`select coalesce(sum(amount_paise), 0)::int as s from worker_ledger_entries where booking_id = ${bookingId}`
    )[0].s as number

  describe('reporting a problem', () => {
    it('either party can report a completed job once; the other side is told', async () => {
      const j = await job()
      const key = randomUUID()
      const first = await raise(
        j.w.cookie,
        j.bookingId,
        { reason: 'PAYMENT', description: 'The customer says they paid but I see nothing.' },
        key,
      )
      expect(first.status).toBe(201)
      const replay = await raise(
        j.w.cookie,
        j.bookingId,
        { reason: 'PAYMENT', description: 'The customer says they paid but I see nothing.' },
        key,
      )
      expect(await json(replay)).toEqual(await json(first))
      expect(await bookingStatus(j.bookingId)).toBe('DISPUTED')

      const again = await raise(j.c.cookie, j.bookingId, problem)
      expect(again.status).toBe(422)
      expect((await json(again)).error.code).toBe('NOT_DISPUTABLE')

      await dispatchOutbox()
      const [note] =
        await sql`select title from notifications where user_id = ${j.c.userId} and type = 'dispute.opened'`
      expect(note.title).toBe('Rakesh reported a problem')
    })

    it('closes 72 hours after completion and is limited to safety during the job', async () => {
      const late = await job()
      await sql`update bookings set completed_at = now() - interval '73 hours' where id = ${late.bookingId}`
      expect((await json(await raise(late.c.cookie, late.bookingId, problem))).error.code).toBe(
        'NOT_DISPUTABLE',
      )

      const stranger = await world.customer()
      expect((await raise(stranger.cookie, late.bookingId, problem)).status).toBe(404)

      const w = await world.worker()
      const c = await world.customer()
      const live = await world.completed(w, c)
      await sql`update bookings set status = 'IN_PROGRESS', completed_at = null where id = ${live.bookingId}`
      expect((await json(await raise(c.cookie, live.bookingId, problem))).error.code).toBe(
        'SAFETY_ONLY',
      )
      const safety = await raise(c.cookie, live.bookingId, {
        reason: 'SAFETY',
        description: 'The professional was abusive and I asked them to leave.',
      })
      expect(safety.status).toBe(201)
    })

    it('both parties can add notes while it is open, nobody else', async () => {
      const j = await job()
      const id = await disputed(j)
      for (const who of [j.c, j.w]) {
        const res = await call(
          evidenceRoute,
          req('/', { cookie: who.cookie, body: { note: 'Photos sent on WhatsApp.' } }),
          withId(id),
        )
        expect(res.status).toBe(201)
      }
      const other = await world.customer()
      const res = await call(
        evidenceRoute,
        req('/', { cookie: other.cookie, body: { note: 'Hi' } }),
        withId(id),
      )
      expect(res.status).toBe(404)
    })
  })

  describe('resolution', () => {
    it('customer favour with a full refund cancels the job and zeroes the professional’s ledger', async () => {
      const j = await job()
      const id = await disputed(j)
      const a = await admin()
      expect(
        (await json(await call(adminDisputesRoute, req('/', { cookie: a.cookie })))).items,
      ).toHaveLength(1)
      const res = await resolve(a.cookie, id, { decision: 'CUSTOMER_FAVOUR', refundPaise: 50_000 })
      expect(res.status).toBe(200)
      expect(await json(res)).toMatchObject({
        outcome: 'CUSTOMER_FAVOUR',
        bookingStatus: 'CANCELLED',
      })
      expect(await bookingStatus(j.bookingId)).toBe('CANCELLED')
      expect(await ledgerSum(j.bookingId)).toBe(0)
      const [p] =
        await sql`select status from payments where booking_id = ${j.bookingId} and status <> 'CANCELLED'`
      expect(p.status).toBe('REFUNDED')
      const [audit] = await sql`select action from admin_audit_logs where entity_id = ${id}`
      expect(audit.action).toBe('DISPUTE_RESOLVED')

      await dispatchOutbox()
      const notes =
        await sql`select user_id, body from notifications where type = 'dispute.resolved' order by user_id`
      expect(notes).toHaveLength(2)
      expect(notes[0].body).toContain('₹500 refunded')
      expect(await sql`select 1 from notifications where type = 'payment.refunded'`).toHaveLength(0)
    })

    it('a split refunds part and leaves the professional the net of the rest', async () => {
      const j = await job()
      const id = await disputed(j)
      const a = await admin()
      const res = await resolve(a.cookie, id, { decision: 'SPLIT', refundPaise: 20_000 })
      expect(await json(res)).toMatchObject({ bookingStatus: 'COMPLETED' })
      // ₹300 kept: ₹300 − 10% fee.
      expect(await ledgerSum(j.bookingId)).toBe(27_000)
      // Partly refunded still counts as paid: no second payment.
      expect((await bookingPayment(j.bookingId)).state).toBe('PAID')
      await expect(
        startPayment(j.c.actor, j.bookingId, { method: 'CASH' }, randomUUID()),
      ).rejects.toMatchObject({ code: 'ALREADY_PAID' })
    })

    it('an unpaid job: the professional’s favour completes it (payable), the customer’s cancels it', async () => {
      const a = await admin()
      const one = await job({ paid: false })
      await startPayment(one.c.actor, one.bookingId, { method: 'CASH' }, randomUUID())
      const id1 = await disputed(one)
      await resolve(a.cookie, id1, { decision: 'WORKER_FAVOUR' })
      expect(await bookingStatus(one.bookingId)).toBe('COMPLETED')

      const two = await job({ paid: false })
      await startPayment(two.c.actor, two.bookingId, { method: 'CASH' }, randomUUID())
      const id2 = await disputed(two)
      await resolve(a.cookie, id2, { decision: 'CUSTOMER_FAVOUR' })
      expect(await bookingStatus(two.bookingId)).toBe('CANCELLED')
      const open =
        await sql`select 1 from payments where booking_id = ${two.bookingId} and status = 'PENDING'`
      expect(open).toHaveLength(0)
    })

    it('rejecting a report returns the booking to where it was', async () => {
      const w = await world.worker()
      const c = await world.customer()
      const live = await world.completed(w, c)
      await sql`update bookings set status = 'IN_PROGRESS', completed_at = null where id = ${live.bookingId}`
      const res = await raise(c.cookie, live.bookingId, {
        reason: 'SAFETY',
        description: 'I felt unsafe and asked them to stop work.',
      })
      const id = (await json(res)).disputeId
      const a = await admin()
      await resolve(a.cookie, id, { decision: 'REJECT' })
      expect(await bookingStatus(live.bookingId)).toBe('IN_PROGRESS')
      // …and the professional can finish the job.
      const [b] = await sql`select version from bookings where id = ${live.bookingId}`
      await transition(w.actor, live.bookingId, { to: 'COMPLETED', expectedVersion: b.version })
      expect(await bookingStatus(live.bookingId)).toBe('COMPLETED')
    })

    it('a mid-job report decided for the professional hands the job back unfinished', async () => {
      const w = await world.worker()
      const c = await world.customer()
      const live = await world.completed(w, c)
      await sql`update bookings set status = 'IN_PROGRESS', completed_at = null where id = ${live.bookingId}`
      const res = await raise(c.cookie, live.bookingId, {
        reason: 'SAFETY',
        description: 'The ladder looked unsafe, so I asked them to stop.',
      })
      const a = await admin()
      await resolve(a.cookie, (await json(res)).disputeId, { decision: 'WORKER_FAVOUR' })
      const [b] = await sql`select status, completed_at from bookings where id = ${live.bookingId}`
      expect(b).toEqual({ status: 'IN_PROGRESS', completed_at: null })
    })

    it('refuses inconsistent or stale decisions', async () => {
      const j = await job()
      const id = await disputed(j)
      const a = await admin()
      const tooMuch = await resolve(a.cookie, id, { decision: 'SPLIT', refundPaise: 60_000 })
      expect((await json(tooMuch)).error.code).toBe('REFUND_TOO_LARGE')
      const workerRefund = await resolve(a.cookie, id, {
        decision: 'WORKER_FAVOUR',
        refundPaise: 100,
      })
      expect((await json(workerRefund)).error.code).toBe('INVALID_RESOLUTION')
      const stale = await call(
        resolveRoute,
        req('/', {
          cookie: a.cookie,
          body: { decision: 'REJECT', note: 'Nothing to do here.', expectedVersion: 99 },
        }),
        withId(id),
      )
      expect((await json(stale)).error.code).toBe('STALE_VERSION')
      const notAdmin = await resolve(j.c.cookie, id, { decision: 'REJECT' })
      expect(notAdmin.status).toBe(403)
    })
  })

  describe('admin refunds', () => {
    it('refunds in parts up to the amount paid, idempotently', async () => {
      const j = await job()
      const a = await admin()
      const [p] =
        await sql`select id from payments where booking_id = ${j.bookingId} and status = 'CAPTURED'`
      const refund = (amountPaise: number, key = randomUUID()) =>
        call(
          refundRoute,
          req('/', {
            cookie: a.cookie,
            body: { amountPaise, reason: 'Goodwill: late arrival.' },
            headers: { 'idempotency-key': key },
          }),
          withId(p.id),
        )
      const key = randomUUID()
      expect((await refund(10_000, key)).status).toBe(201)
      expect((await refund(10_000, key)).headers.get('idempotent-replayed')).toBe('true')
      const over = await refund(45_000)
      expect((await json(over)).error).toMatchObject({
        code: 'REFUND_TOO_LARGE',
        details: { remainingPaise: 40_000 },
      })
      expect((await refund(40_000)).status).toBe(201)
      expect(await ledgerSum(j.bookingId)).toBe(0)
      expect(
        await sql`select 1 from admin_audit_logs where action = 'PAYMENT_REFUNDED'`,
      ).toHaveLength(2)
    })

    it('concurrent refunds never exceed the payment', async () => {
      const j = await job()
      const a = await admin()
      const [p] =
        await sql`select id from payments where booking_id = ${j.bookingId} and status = 'CAPTURED'`
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          call(
            refundRoute,
            req('/', {
              cookie: a.cookie,
              body: { amountPaise: 30_000, reason: 'Duplicate charge claim.' },
              headers: { 'idempotency-key': randomUUID() },
            }),
            withId(p.id),
          ),
        ),
      )
      expect(results.filter((r) => r.status === 201)).toHaveLength(1)
      const [total] =
        await sql`select sum(amount_paise)::int as s from refunds where payment_id = ${p.id}`
      expect(total.s).toBe(30_000)
    })
  })

  describe('support tickets', () => {
    it('a customer asks for help about their booking; an admin replies and closes it', async () => {
      const j = await job()
      const create = await call(
        createTicketRoute,
        req('/', {
          cookie: j.c.cookie,
          body: {
            category: 'BOOKING',
            subject: 'Receipt question',
            message: 'Can I get a GST invoice for this job?',
            bookingId: j.bookingId,
          },
        }),
      )
      expect(create.status).toBe(201)
      const { ticketId } = await json(create)

      const stranger = await world.customer()
      const peek = await call(ticketRoute, req('/', { cookie: stranger.cookie }), withId(ticketId))
      expect(peek.status).toBe(404)
      const foreignBooking = await call(
        createTicketRoute,
        req('/', {
          cookie: stranger.cookie,
          body: {
            category: 'BOOKING',
            subject: 'Not mine',
            message: 'Asking about someone else’s job.',
            bookingId: j.bookingId,
          },
        }),
      )
      expect(foreignBooking.status).toBe(404)

      const a = await admin()
      const reply = await call(
        messageRoute,
        req('/', { cookie: a.cookie, body: { body: 'Receipts are not tax invoices yet.' } }),
        withId(ticketId),
      )
      expect(reply.status).toBe(201)
      const thread = (
        await json(await call(ticketRoute, req('/', { cookie: j.c.cookie }), withId(ticketId)))
      ).ticket
      expect(thread.status).toBe('IN_PROGRESS')
      expect(thread.messages[1]).toMatchObject({ fromKaamico: true, senderName: null })
      const [note] =
        await sql`select link from notifications where user_id = ${j.c.userId} and type = 'support.replied'`
      expect(note.link).toBe(`/support/${ticketId}`)

      const close = await call(
        ticketStatusRoute,
        req('/', { method: 'PATCH', cookie: a.cookie, body: { status: 'CLOSED' } }),
        withId(ticketId),
      )
      expect(close.status).toBe(200)
      const late = await call(
        messageRoute,
        req('/', { cookie: j.c.cookie, body: { body: 'One more thing' } }),
        withId(ticketId),
      )
      expect((await json(late)).error.code).toBe('TICKET_CLOSED')
      expect(
        await sql`select 1 from admin_audit_logs where action = 'TICKET_STATUS_CHANGED'`,
      ).toHaveLength(1)
    })

    it('a professional’s reply link points to the professional area', async () => {
      const w = await world.worker()
      const { ticketId } = await json(
        await call(
          createTicketRoute,
          req('/', {
            cookie: w.cookie,
            body: {
              category: 'VERIFICATION',
              subject: 'ID check',
              message: 'How long does verification take?',
            },
          }),
        ),
      )
      const a = await admin()
      await call(
        messageRoute,
        req('/', { cookie: a.cookie, body: { body: 'Usually a day.' } }),
        withId(ticketId),
      )
      const [note] = await sql`select link from notifications where user_id = ${w.userId}`
      expect(note.link).toBe(`/worker/support/${ticketId}`)
    })
  })
})
