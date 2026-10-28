import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as statusRoute } from '@/app/api/v1/admin/payouts/[id]/status/route'
import { GET as adminPayoutsRoute } from '@/app/api/v1/admin/payouts/route'
import { POST as requestRoute } from '@/app/api/v1/worker/payouts/request/route'
import { GET as payoutsRoute } from '@/app/api/v1/worker/payouts/route'
import { SESSION_COOKIE_PLAIN } from '@/modules/auth/cookies'
import { createSession } from '@/modules/auth/sessions'
import { dispatchOutbox } from '@/modules/notifications/dispatcher'
import { call, json, req, userWithSession, withId } from '@/test/api'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import { earningsSummary } from './earnings'
import { payoutAvailability } from './payouts'

describe.skipIf(!hasTestDatabase)('payout requests', () => {
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

  /** A ledger entry `hoursAgo` old (setup only; the ledger is append-only in the app). */
  const entry = (
    workerId: string,
    type: string,
    amountPaise: number,
    hoursAgo: number,
    bookingId: string | null = null,
  ) => sql`insert into worker_ledger_entries (worker_id, booking_id, type, amount_paise, description, created_at)
      values (${workerId}, ${bookingId}, ${type}, ${amountPaise}, 'test', now() - make_interval(hours => ${hoursAgo}))`

  const ask = (cookie: string, amountPaise: number, key = world.key()) =>
    call(
      requestRoute,
      req('/', { cookie, body: { amountPaise }, headers: { 'idempotency-key': key } }),
    )
  const setStatus = (cookie: string, id: string, body: unknown) =>
    call(statusRoute, req('/', { cookie, body }), withId(id))
  const balance = async (workerId: string) =>
    (
      await sql`select coalesce(sum(amount_paise), 0)::int as b from worker_ledger_entries where worker_id = ${workerId}`
    )[0].b as number

  it('pays out only what is past the 72-hour window, after deductions', async () => {
    const w = await world.worker()
    await entry(w.workerId, 'ADJUSTMENT', 60_000, 100) // ready
    await entry(w.workerId, 'ADJUSTMENT', 40_000, 10) // still on hold
    await entry(w.workerId, 'ADJUSTMENT', -5_000, 1) // deductions count at once
    const a = await payoutAvailability(w.workerId)
    expect(a).toMatchObject({ balancePaise: 95_000, availablePaise: 55_000, onHoldPaise: 40_000 })

    const res = await call(payoutsRoute, req('/', { cookie: w.cookie }))
    expect((await json(res)).availability).toMatchObject({ availablePaise: 55_000 })

    const tooMuch = await ask(w.cookie, 60_000)
    expect(tooMuch.status).toBe(422)
    expect((await json(tooMuch)).error.code).toBe('PAYOUT_ABOVE_AVAILABLE')
    const tooLittle = await ask(w.cookie, 9_999)
    expect(tooLittle.status).toBe(400)

    const ok = await ask(w.cookie, 55_000)
    expect(ok.status).toBe(201)
    expect(await json(ok)).toMatchObject({
      amountPaise: 55_000,
      status: 'REQUESTED',
      mode: 'SIMULATED',
    })
    expect(await balance(w.workerId)).toBe(40_000)
    expect(await payoutAvailability(w.workerId)).toMatchObject({
      availablePaise: 0,
      onHoldPaise: 40_000,
    })
  })

  it('holds earnings from a job with an open problem report', async () => {
    const { w, c, bookingId } = await world.completed()
    await admin()
    await entry(w.workerId, 'ADJUSTMENT', 30_000, 100, bookingId)
    expect((await payoutAvailability(w.workerId)).availablePaise).toBe(30_000)
    await sql`insert into disputes (booking_id, raised_by_user_id, raised_by_role, reason, description, previous_booking_status)
      values (${bookingId}, ${c.userId}, 'CUSTOMER', 'POOR_QUALITY', 'The tap still leaks after the repair.', 'COMPLETED')`
    expect(await payoutAvailability(w.workerId)).toMatchObject({
      availablePaise: 0,
      onHoldPaise: 30_000,
    })
    await sql`update disputes set status = 'REJECTED', resolution_note = 'Fixed on a revisit.', resolved_at = now(),
      resolved_by_admin_id = (select id from users where 'ADMIN' = any(roles) limit 1),
      outcome = 'NO_ACTION' where booking_id = ${bookingId}`
    expect((await payoutAvailability(w.workerId)).availablePaise).toBe(30_000)
  })

  it('allows one payout at a time, even when asked twice at once', async () => {
    const w = await world.worker()
    await entry(w.workerId, 'ADJUSTMENT', 100_000, 100)
    const results = await Promise.all([ask(w.cookie, 20_000), ask(w.cookie, 30_000)])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    const [rows] = await sql`select count(*)::int as n from payouts where worker_id = ${w.workerId}`
    expect(rows.n).toBe(1)

    // A retry with the same key replays the original answer instead of asking again.
    const key = world.key()
    await sql`update payouts set status = 'PAID', paid_at = now() where worker_id = ${w.workerId}`
    const first = await ask(w.cookie, 10_000, key)
    const replay = await ask(w.cookie, 10_000, key)
    expect((await json(replay)).id).toBe((await json(first)).id)
  })

  it('admin moves a payout on; a failed one returns the money and both are told', async () => {
    const w = await world.worker()
    const a = await admin()
    await entry(w.workerId, 'ADJUSTMENT', 50_000, 100)
    const first = await json(await ask(w.cookie, 20_000))

    // Workers cannot settle their own payouts.
    expect((await setStatus(w.cookie, first.id, { status: 'PAID' })).status).toBe(403)

    const queue = await json(
      await call(adminPayoutsRoute, req('/?status=OPEN', { cookie: a.cookie })),
    )
    expect(queue.items.map((p: { id: string }) => p.id)).toEqual([first.id])

    expect((await setStatus(a.cookie, first.id, { status: 'PROCESSING' })).status).toBe(200)
    const paid = await json(await setStatus(a.cookie, first.id, { status: 'PAID' }))
    expect(paid).toMatchObject({ status: 'PAID', reference: expect.stringMatching(/^SIM-PAYOUT-/) })
    expect(paid.paidAt).not.toBeNull()
    // Paid is final.
    const again = await setStatus(a.cookie, first.id, {
      status: 'FAILED',
      reason: 'Bank account closed',
    })
    expect(again.status).toBe(409)

    const second = await json(await ask(w.cookie, 30_000))
    expect(await balance(w.workerId)).toBe(0)
    const noReason = await setStatus(a.cookie, second.id, { status: 'FAILED' })
    expect(noReason.status).toBe(400)
    const failed = await setStatus(a.cookie, second.id, {
      status: 'FAILED',
      reason: 'The UPI ID was not valid.',
    })
    expect(await json(failed)).toMatchObject({
      status: 'FAILED',
      failureReason: 'The UPI ID was not valid.',
    })
    expect(await balance(w.workerId)).toBe(30_000)

    // The summary counts only what actually left.
    expect(await earningsSummary(w.workerId, 'all')).toMatchObject({
      paidOutPaise: 20_000,
      adjustmentsPaise: 50_000,
      balancePaise: 30_000,
    })

    const audit =
      await sql`select action from admin_audit_logs where entity_type = 'payout' order by id`
    expect(audit.map((r) => r.action)).toEqual([
      'PAYOUT_PROCESSING',
      'PAYOUT_PAID',
      'PAYOUT_FAILED',
    ])

    await dispatchOutbox()
    const notes =
      await sql`select type, title, body from notifications where user_id = ${w.userId} order by created_at, id`
    expect(notes).toEqual([
      expect.objectContaining({ type: 'payout.paid', title: 'Payout of ₹200 sent' }),
      expect.objectContaining({
        type: 'payout.failed',
        title: 'Your payout of ₹300 did not go through',
        body: 'The UPI ID was not valid. The amount is back in your balance.',
      }),
    ])
  })
})
