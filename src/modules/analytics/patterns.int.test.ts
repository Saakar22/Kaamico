import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createBooking } from '@/modules/bookings/create'
import { needsCooldownPrompt, unansweredExpiredCount } from '@/modules/bookings/cooldown'
import { cancelBooking } from '@/modules/bookings/lifecycle'
import { acceptOffer, makeOffer } from '@/modules/negotiation/offers'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import { repeatCancellingPairs } from './patterns'

describe.skipIf(!hasTestDatabase)('abuse signals', () => {
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
  const hours = (n: number) => new Date(world.tomorrow().getTime() + n * 3_600_000).toISOString()

  /** A request whose slot starts `n` hours after tomorrow 11:00 IST. */
  const request = (c: C, w: W, n: number) =>
    createBooking(c.actor, world.request(c, w, { requestedStart: hours(n) }), world.key())

  it('prompts a customer whose requests keep lapsing with a quote unanswered', async () => {
    const w = await world.worker()
    const c = await world.customer()
    for (let i = 0; i < 3; i++) {
      const { bookingId } = await request(c, w, i * 2)
      await makeOffer(w.actor, bookingId, { amountPaise: 55_000, note: 'Parts included' })
      await sql`update price_offers set status = 'EXPIRED' where booking_id = ${bookingId} and status = 'PENDING'`
      await sql`update bookings set status = 'EXPIRED' where id = ${bookingId}`
      expect(await needsCooldownPrompt(c.userId)).toBe(i === 2)
    }
    // A lapsed request the professional never answered does not count against the customer.
    const { bookingId } = await request(c, w, 8)
    await sql`update price_offers set status = 'EXPIRED' where booking_id = ${bookingId}`
    await sql`update bookings set status = 'EXPIRED' where id = ${bookingId}`
    expect(await unansweredExpiredCount(c.userId)).toBe(3)
    // Older than the 7-day window: forgotten.
    await sql`update bookings set created_at = now() - interval '8 days' where customer_id = ${c.userId}`
    expect(await needsCooldownPrompt(c.userId)).toBe(false)
  })

  it('reports pairs who cancel confirmed jobs with each other twice or more', async () => {
    const w = await world.worker()
    const c = await world.customer()
    const other = await world.customer()
    const confirmed = async (cust: C, n: number) => {
      const { bookingId } = await request(cust, w, n)
      const [offer] = await sql`select id from price_offers where booking_id = ${bookingId}`
      await acceptOffer(w.actor, offer.id, {
        expectedBookingVersion: await world.version(bookingId),
      })
      return bookingId
    }

    const first = await confirmed(c, 0)
    await cancelBooking(c.actor, first, { expectedVersion: await world.version(first) })
    const once = await confirmed(other, 2)
    await cancelBooking(w.actor, once, {
      expectedVersion: await world.version(once),
      reason: 'Fell ill',
    })
    expect(await repeatCancellingPairs()).toEqual([])

    const second = await confirmed(c, 4)
    await cancelBooking(w.actor, second, {
      expectedVersion: await world.version(second),
      reason: 'Fell ill',
    })
    const pairs = await repeatCancellingPairs()
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({
      customerId: c.userId,
      workerId: w.workerId,
      cancellations: 2,
      byCustomer: 1,
      byWorker: 1,
    })
    expect(pairs[0].bookings.map((b) => b.id).sort()).toEqual([first, second].sort())
    expect(await repeatCancellingPairs({ now: new Date(Date.now() + 31 * 86_400_000) })).toEqual([])
  })
})
