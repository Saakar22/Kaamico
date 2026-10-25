import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as createRoute } from '@/app/api/v1/bookings/route'
import { acceptOffer } from '@/modules/negotiation/offers'
import { call, req } from '@/test/api'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import { createBooking } from './create'
import { cancelBooking } from './lifecycle'

/** Runs promises together and tallies the outcomes by error code. */
async function race(tasks: (() => Promise<unknown>)[]): Promise<Record<string, number>> {
  const results = await Promise.allSettled(tasks.map((t) => t()))
  const tally: Record<string, number> = {}
  for (const r of results) {
    const key =
      r.status === 'fulfilled'
        ? r.value instanceof Response
          ? `HTTP ${r.value.status}`
          : 'OK'
        : ((r.reason as { code?: string }).code ?? String(r.reason))
    tally[key] = (tally[key] ?? 0) + 1
  }
  return tally
}

describe.skipIf(!hasTestDatabase)('booking concurrency', () => {
  const sql = connectTestDb()
  let world: Awaited<ReturnType<typeof bookingWorld>>

  beforeEach(async () => {
    await truncateAll(sql)
    world = await bookingWorld(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  it(
    'confirms exactly one of 50 parallel bookings for the same slot',
    { timeout: 120_000 },
    async () => {
      const w = await world.worker()
      const start = world.tomorrow().toISOString()
      const customers = await Promise.all(Array.from({ length: 50 }, () => world.customer()))
      const bookingIds: string[] = []
      for (const c of customers) {
        const { bookingId } = await createBooking(
          c.actor,
          world.request(c, w, { requestedStart: start }),
          world.key(),
        )
        bookingIds.push(bookingId)
      }
      const offers = await sql`select id, booking_id from price_offers where status = 'PENDING'`
      expect(offers).toHaveLength(50)

      const tally = await race(
        offers.map((o) => () => acceptOffer(w.actor, o.id, { expectedBookingVersion: 1 })),
      )
      expect(tally).toEqual({ OK: 1, SLOT_TAKEN: 49 })

      const active =
        await sql`select count(*)::int as n from bookings where worker_id = ${w.workerId} and status = 'CONFIRMED'`
      expect(active[0].n).toBe(1)
      // The losers stay open for the customers to choose someone else; nothing was half-applied.
      const accepted =
        await sql`select count(*)::int as n from price_offers where status = 'ACCEPTED'`
      expect(accepted[0].n).toBe(1)
    },
  )

  it('lets exactly one of 10 parallel accepts of the same offer win', async () => {
    const w = await world.worker()
    const c = await world.customer()
    const { bookingId } = await createBooking(c.actor, world.request(c, w), world.key())
    const [offer] = await sql`select id from price_offers where booking_id = ${bookingId}`
    const tally = await race(
      Array.from(
        { length: 10 },
        () => () => acceptOffer(w.actor, offer.id, { expectedBookingVersion: 1 }),
      ),
    )
    expect(tally.OK).toBe(1)
    expect((tally.STALE_VERSION ?? 0) + (tally.OFFER_NOT_PENDING ?? 0)).toBe(9)
    const history =
      await sql`select to_status from booking_status_history where booking_id = ${bookingId} and to_status = 'CONFIRMED'`
    expect(history).toHaveLength(1)
  })

  it('creates one booking for parallel retries with the same Idempotency-Key', async () => {
    const w = await world.worker()
    const c = await world.customer()
    const key = world.key()
    const body = world.request(c, w)
    const tally = await race(
      Array.from(
        { length: 10 },
        () => () =>
          call(
            createRoute,
            req('/api/v1/bookings', {
              cookie: c.cookie,
              body,
              headers: { 'idempotency-key': key },
            }),
          ),
      ),
    )
    // One creates; the rest see it in progress (409) or replay it (201).
    expect((tally['HTTP 201'] ?? 0) + (tally['HTTP 409'] ?? 0)).toBe(10)
    expect(tally['HTTP 201']).toBeGreaterThanOrEqual(1)
    expect(await sql`select count(*)::int as n from bookings`).toEqual([{ n: 1 }])
  })

  it('keeps a booking consistent when the customer cancels while the worker accepts', async () => {
    for (let i = 0; i < 5; i++) {
      const w = await world.worker()
      const c = await world.customer()
      const { bookingId } = await createBooking(c.actor, world.request(c, w), world.key())
      const [offer] = await sql`select id from price_offers where booking_id = ${bookingId}`
      const tally = await race([
        () => acceptOffer(w.actor, offer.id, { expectedBookingVersion: 1 }),
        () => cancelBooking(c.actor, bookingId, { expectedVersion: 1 }),
      ])
      expect(tally.OK).toBe(1)
      const [b] =
        await sql`select status, worker_id, agreed_price_paise from bookings where id = ${bookingId}`
      if (b.status === 'CONFIRMED') expect(b.agreed_price_paise).toBe(50000)
      else
        expect(b).toMatchObject({ status: 'CANCELLED', worker_id: null, agreed_price_paise: null })
    }
  })
})
