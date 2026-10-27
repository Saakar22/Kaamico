import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as createRoute } from '@/app/api/v1/bookings/route'
import { acceptOffer, makeOffer } from '@/modules/negotiation/offers'
import { dispatchOutbox } from '@/modules/notifications/dispatcher'
import { call, json, req } from '@/test/api'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import { declineRequest } from './lifecycle'
import { createQuickMatch } from './quick-match'
import { getQuickMatch, getWorkerRequest } from './views'

describe.skipIf(!hasTestDatabase)('quick match (broadcast)', () => {
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

  /** `n` professionals free now, priced ₹500, ₹510, ₹520… */
  async function workers(n: number): Promise<W[]> {
    const list: W[] = []
    for (let i = 0; i < n; i++) {
      const w = await world.worker()
      await sql`update worker_service_pricing set price_paise = ${50_000 + i * 1_000}
        where worker_id = ${w.workerId}`
      list.push(w)
    }
    return list
  }

  const quick = (c: Awaited<ReturnType<typeof world.customer>>) =>
    createQuickMatch(
      c.actor,
      { mode: 'BROADCAST', serviceId: world.serviceId, addressId: c.addressId },
      randomUUID(),
    )

  const version = async (id: string) =>
    (await sql`select version from bookings where id = ${id}`)[0].version as number
  const offerFor = async (bookingId: string, workerId: string) =>
    (
      await sql`select id from price_offers where booking_id = ${bookingId} and worker_id = ${workerId}
      and status = 'PENDING' order by round desc limit 1`
    )[0]?.id as string

  it('invites at most five professionals free now, each at their own price', async () => {
    const pros = await workers(6)
    const offline = await world.worker({ online: false })
    const c = await world.customer()
    const res = await call(
      createRoute,
      req('/', {
        cookie: c.cookie,
        body: { mode: 'BROADCAST', serviceId: world.serviceId, addressId: c.addressId },
        headers: { 'idempotency-key': randomUUID() },
      }),
    )
    expect(res.status).toBe(201)
    const { bookingId, invited } = await json(res)
    expect(invited).toBe(5)
    const rows = await sql`select i.worker_id, o.amount_paise from booking_invitations i
      join price_offers o on o.invitation_id = i.id where i.booking_id = ${bookingId}`
    expect(rows).toHaveLength(5)
    expect(rows.map((r) => r.worker_id)).not.toContain(offline.workerId)
    for (const r of rows) {
      const i = pros.findIndex((p) => p.workerId === r.worker_id)
      expect(r.amount_paise).toBe(50_000 + i * 1_000)
    }
    const [b] =
      await sql`select mode, timing, status, listed_price_paise from bookings where id = ${bookingId}`
    expect(b).toEqual({
      mode: 'BROADCAST',
      timing: 'ON_DEMAND',
      status: 'REQUESTED',
      listed_price_paise: null,
    })

    await dispatchOutbox()
    const notes = await sql`select title from notifications where type = 'booking.requested'`
    expect(notes).toHaveLength(5)
    expect(notes[0].title).toBe('Quick match: Tap repair now')
  })

  it('says so when nobody nearby is free now', async () => {
    await world.worker({ online: false })
    const c = await world.customer()
    await expect(quick(c)).rejects.toMatchObject({ code: 'NO_ONE_AVAILABLE' })
  })

  it('first accept wins: five professionals accepting at once give exactly one booking', async () => {
    const pros = await workers(5)
    const c = await world.customer()
    const { bookingId } = await quick(c)
    const v = await version(bookingId)
    const offers = await Promise.all(pros.map((p) => offerFor(bookingId, p.workerId)))
    const results = await Promise.allSettled(
      pros.map((p, i) => acceptOffer(p.actor, offers[i], { expectedBookingVersion: v })),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const [b] =
      await sql`select status, worker_id, agreed_price_paise from bookings where id = ${bookingId}`
    expect(b.status).toBe('CONFIRMED')
    const statuses =
      await sql`select worker_id, status from booking_invitations where booking_id = ${bookingId}`
    expect(statuses.filter((s) => s.status === 'WON')).toEqual([
      { worker_id: b.worker_id, status: 'WON' },
    ])
    expect(statuses.filter((s) => s.status === 'LOST')).toHaveLength(4)
    const winner = pros.findIndex((p) => p.workerId === b.worker_id)
    expect(b.agreed_price_paise).toBe(50_000 + winner * 1_000)

    await dispatchOutbox()
    const taken = await sql`select user_id from notifications where type = 'request.taken'`
    expect(taken).toHaveLength(4)

    // A professional who lost sees it is taken, and never the address.
    const loser = pros.find((p) => p.workerId !== b.worker_id)!
    const [inv] =
      await sql`select id from booking_invitations where booking_id = ${bookingId} and worker_id = ${loser.workerId}`
    const view = await getWorkerRequest(loser.actor, inv.id)
    expect(view).toMatchObject({ invitationStatus: 'LOST', assigned: false, address: null })
  })

  it('a decline only closes that invitation; the last one ends the request', async () => {
    const pros = await workers(2)
    const c = await world.customer()
    const { bookingId } = await quick(c)
    const invites =
      await sql`select id, worker_id from booking_invitations where booking_id = ${bookingId}`
    const inviteOf = (w: W) => invites.find((i) => i.worker_id === w.workerId)!.id
    expect(await declineRequest(pros[0].actor, inviteOf(pros[0]), {})).toMatchObject({
      status: 'REQUESTED',
    })
    expect((await getQuickMatch(c.actor, bookingId)).map((x) => x.status).sort()).toEqual([
      'DECLINED',
      'WAITING',
    ])
    // The other one can still take it.
    const stillOpen = await offerFor(bookingId, pros[1].workerId)
    expect(stillOpen).toBeTruthy()
    expect(await declineRequest(pros[1].actor, inviteOf(pros[1]), {})).toMatchObject({
      status: 'CANCELLED',
    })
  })

  it('the customer can accept a professional’s counteroffer; everyone else loses', async () => {
    const pros = await workers(3)
    const c = await world.customer()
    const { bookingId } = await quick(c)
    await makeOffer(pros[2].actor, bookingId, {
      amountPaise: 54_000,
      note: 'Includes a new washer',
    })
    const candidates = await getQuickMatch(c.actor, bookingId)
    const countered = candidates.find((x) => x.workerId === pros[2].workerId)!
    expect(countered).toMatchObject({ status: 'COUNTERED', pricePaise: 54_000 })
    await acceptOffer(c.actor, countered.acceptableOfferId!, {
      expectedBookingVersion: await version(bookingId),
    })
    const [b] =
      await sql`select status, worker_id, agreed_price_paise from bookings where id = ${bookingId}`
    expect(b).toEqual({
      status: 'CONFIRMED',
      worker_id: pros[2].workerId,
      agreed_price_paise: 54_000,
    })
  })

  it('counts as one open request, and skips professionals already asked', async () => {
    await workers(2)
    const c = await world.customer()
    await quick(c)
    // Both are already on an open request from this customer.
    await expect(quick(c)).rejects.toMatchObject({ code: 'NO_ONE_AVAILABLE' })
    await workers(1)
    await quick(c)
    await workers(1)
    await quick(c)
    await workers(1)
    await expect(quick(c)).rejects.toMatchObject({ code: 'TOO_MANY_OPEN_REQUESTS' })
  })
})
