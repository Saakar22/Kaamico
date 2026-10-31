import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as ratingRoute } from '@/app/api/v1/bookings/[id]/customer-rating/route'
import { getWorkerBooking } from '@/modules/bookings/views'
import { call, json, req, withId } from '@/test/api'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import {
  CUSTOMER_RATING_MIN_COUNT,
  customerRatingState,
  ownCustomerRating,
  rateCustomer,
} from './customer-ratings'

const DAY = 86_400_000

describe.skipIf(!hasTestDatabase)('professionals rate customers', () => {
  const sql = connectTestDb()
  let world: Awaited<ReturnType<typeof bookingWorld>>

  beforeEach(async () => {
    await truncateAll(sql)
    world = await bookingWorld(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  const rate = (cookie: string, bookingId: string, body: unknown) =>
    call(
      ratingRoute,
      req('/', { cookie, body, headers: { 'idempotency-key': world.key() } }),
      withId(bookingId),
    )

  it('lets the assigned professional rate a completed job once, privately', async () => {
    const { w, c, bookingId } = await world.completed()
    expect(await customerRatingState(w.actor, bookingId)).toEqual({ rating: null, canRate: true })

    const res = await rate(w.cookie, bookingId, {
      rating: 4,
      tags: ['paid_promptly', 'paid_promptly', 'respectful'],
      note: '  Dog was loose in the hall  ',
    })
    expect(res.status).toBe(201)
    expect(await json(res)).toEqual({ rating: 4 })
    expect(
      await sql`select rating, tags, note from customer_ratings where booking_id = ${bookingId}`,
    ).toEqual([
      { rating: 4, tags: ['paid_promptly', 'respectful'], note: 'Dog was loose in the hall' },
    ])
    expect(await customerRatingState(w.actor, bookingId)).toEqual({ rating: 4, canRate: false })

    expect((await json(await rate(w.cookie, bookingId, { rating: 5 }))).error.code).toBe(
      'ALREADY_REVIEWED',
    )
    // Not the customer, not another professional.
    expect((await rate(c.cookie, bookingId, { rating: 5 })).status).toBe(403)
    const other = await world.worker()
    expect((await rate(other.cookie, bookingId, { rating: 5 })).status).toBe(404)
    expect((await rate(w.cookie, bookingId, { rating: 6 })).status).toBe(400)
    // Ratings never change, even straight in the database.
    await expect(sql`update customer_ratings set rating = 1`).rejects.toThrow()
  })

  it('only after completion and within 14 days', async () => {
    const { w, bookingId } = await world.completed()
    const late = new Date(Date.now() + 15 * DAY)
    expect(await customerRatingState(w.actor, bookingId, late)).toMatchObject({ canRate: false })
    await expect(rateCustomer(w.actor, bookingId, { rating: 3 }, late)).rejects.toMatchObject({
      code: 'REVIEW_WINDOW_CLOSED',
    })
    await sql`update bookings set status = 'DISPUTED' where id = ${bookingId}`
    await expect(rateCustomer(w.actor, bookingId, { rating: 3 })).rejects.toMatchObject({
      code: 'NOT_REVIEWABLE',
    })
  })

  it(`shows professionals an average only from ${CUSTOMER_RATING_MIN_COUNT} ratings`, async () => {
    const c = await world.customer()
    const ratings = [5, 4, 3]
    const jobs: Awaited<ReturnType<typeof world.completed>>[] = []
    for (const rating of ratings) {
      const job = await world.completed(undefined, c)
      await rateCustomer(job.w.actor, job.bookingId, { rating })
      jobs.push(job)
    }
    const view = (i: number) => getWorkerBooking(jobs[i].w.actor, jobs[i].bookingId)
    expect(await ownCustomerRating(c.userId)).toEqual({ avg: 4, count: 3 })
    expect((await view(2)).customerRating).toEqual({ avg: 4, count: 3 })

    // With fewer ratings nobody sees anything, not even the customer.
    const fresh = await world.customer()
    const job = await world.completed(undefined, fresh)
    await rateCustomer(job.w.actor, job.bookingId, { rating: 2 })
    expect(await ownCustomerRating(fresh.userId)).toBeNull()
    expect((await getWorkerBooking(job.w.actor, job.bookingId)).customerRating).toBeNull()
  })
})
