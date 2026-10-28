import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PATCH as moderateRoute } from '@/app/api/v1/admin/reviews/[id]/route'
import { GET as adminReviewsRoute } from '@/app/api/v1/admin/reviews/route'
import { DELETE as unsaveRoute, PUT as saveRoute } from '@/app/api/v1/favorites/[workerId]/route'
import { GET as favoritesRoute } from '@/app/api/v1/favorites/route'
import { PATCH as accountRoute } from '@/app/api/v1/me/route'
import { GET as publicReviewsRoute } from '@/app/api/v1/professionals/[id]/reviews/route'
import { POST as replyRoute } from '@/app/api/v1/reviews/[id]/reply/route'
import { POST as reportRoute } from '@/app/api/v1/reviews/[id]/report/route'
import { SESSION_COOKIE_PLAIN } from '@/modules/auth/cookies'
import { createSession } from '@/modules/auth/sessions'
import { dispatchOutbox } from '@/modules/notifications/dispatcher'
import { call, json, req, userWithSession, withId } from '@/test/api'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import { createReview } from './reviews'

describe.skipIf(!hasTestDatabase)('review replies, reports, moderation and favorites', () => {
  const sql = connectTestDb()
  let world: Awaited<ReturnType<typeof bookingWorld>>

  beforeEach(async () => {
    await truncateAll(sql)
    world = await bookingWorld(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  /** Admin powers need an ADMIN-scoped session (from the admin sign-in). */
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

  type W = Awaited<ReturnType<typeof world.worker>>
  async function reviewed(rating = 2, w?: W) {
    const job = await world.completed(w)
    const { review } = await createReview(job.c.actor, job.bookingId, {
      rating,
      comment: 'Came late and left a mess.',
    })
    return { ...job, reviewId: review.id }
  }

  const rating = async (workerId: string) =>
    (await sql`select rating_sum, rating_count from worker_profiles where id = ${workerId}`)[0] as {
      rating_sum: number
      rating_count: number
    }

  const publicItems = async (workerId: string) =>
    (await json(await call(publicReviewsRoute, req('/'), withId(workerId)))).items as {
      id: string
      workerReply: string | null
    }[]

  describe('replies', () => {
    it('lets the reviewed professional reply once and tells the customer', async () => {
      const { w, c, reviewId } = await reviewed()
      const body = { reply: 'Sorry about that. The earlier job ran over.' }
      const res = await call(replyRoute, req('/', { cookie: w.cookie, body }), withId(reviewId))
      expect(res.status).toBe(200)
      expect((await publicItems(w.workerId))[0].workerReply).toBe(body.reply)

      const again = await call(replyRoute, req('/', { cookie: w.cookie, body }), withId(reviewId))
      expect(again.status).toBe(409)
      expect((await json(again)).error.code).toBe('ALREADY_REPLIED')

      await dispatchOutbox()
      const [note] = await sql`select title from notifications
        where user_id = ${c.userId} and type = 'review.replied'`
      expect(note.title).toBe('Rakesh replied to your review')
    })

    it('hides the review from other professionals and customers', async () => {
      const { c, reviewId } = await reviewed()
      const other = await world.worker()
      const body = { reply: 'Not my review' }
      const byOther = await call(
        replyRoute,
        req('/', { cookie: other.cookie, body }),
        withId(reviewId),
      )
      expect(byOther.status).toBe(404)
      const byCustomer = await call(
        replyRoute,
        req('/', { cookie: c.cookie, body }),
        withId(reviewId),
      )
      expect(byCustomer.status).toBe(403)
    })
  })

  describe('reports and moderation', () => {
    it('keeps a reported review visible until an admin hides it, then fixes the rating', async () => {
      const { w, reviewId } = await reviewed(2)
      await reviewed(4, w)
      expect(await rating(w.workerId)).toEqual({ rating_sum: 6, rating_count: 2 })

      const report = await call(
        reportRoute,
        req('/', { cookie: w.cookie, body: { reason: 'The customer was not home at the time.' } }),
        withId(reviewId),
      )
      expect(report.status).toBe(200)
      expect((await publicItems(w.workerId)).map((r) => r.id)).toContain(reviewId)
      const twice = await call(
        reportRoute,
        req('/', { cookie: w.cookie, body: { reason: 'The customer was not home at the time.' } }),
        withId(reviewId),
      )
      expect((await json(twice)).error.code).toBe('ALREADY_REPORTED')

      const a = await admin()
      const queue = await json(await call(adminReviewsRoute, req('/', { cookie: a.cookie })))
      expect(queue.items).toHaveLength(1)
      expect(queue.items[0]).toMatchObject({ id: reviewId, status: 'FLAGGED', flaggedBy: 'WORKER' })

      const hide = await call(
        moderateRoute,
        req('/', {
          method: 'PATCH',
          cookie: a.cookie,
          body: { action: 'HIDE', reason: 'Describes a different job entirely.' },
        }),
        withId(reviewId),
      )
      expect(hide.status).toBe(200)
      expect(await rating(w.workerId)).toEqual({ rating_sum: 4, rating_count: 1 })
      expect((await publicItems(w.workerId)).map((r) => r.id)).not.toContain(reviewId)
      const [audit] =
        await sql`select action, reason from admin_audit_logs where entity_id = ${reviewId}`
      expect(audit).toEqual({
        action: 'REVIEW_HIDDEN',
        reason: 'Describes a different job entirely.',
      })

      const restore = await call(
        moderateRoute,
        req('/', {
          method: 'PATCH',
          cookie: a.cookie,
          body: { action: 'RESTORE', reason: 'The customer sent photos of the job.' },
        }),
        withId(reviewId),
      )
      expect(restore.status).toBe(200)
      expect(await rating(w.workerId)).toEqual({ rating_sum: 6, rating_count: 2 })
    })

    it('dismissing a report keeps the rating unchanged', async () => {
      const { c, w, reviewId } = await reviewed(3)
      await call(
        reportRoute,
        req('/', { cookie: c.cookie, body: { reason: 'I chose the wrong number of stars.' } }),
        withId(reviewId),
      )
      const a = await admin()
      await call(
        moderateRoute,
        req('/', {
          method: 'PATCH',
          cookie: a.cookie,
          body: { action: 'RESTORE', reason: 'Nothing wrong with this review.' },
        }),
        withId(reviewId),
      )
      expect(await rating(w.workerId)).toEqual({ rating_sum: 3, rating_count: 1 })
      const [row] = await sql`select status from reviews where id = ${reviewId}`
      expect(row.status).toBe('PUBLISHED')
    })

    it('admin moderation needs an admin session and a reason', async () => {
      const { w, reviewId } = await reviewed()
      const asWorker = await call(
        moderateRoute,
        req('/', {
          method: 'PATCH',
          cookie: w.cookie,
          body: { action: 'HIDE', reason: 'x'.repeat(12) },
        }),
        withId(reviewId),
      )
      expect(asWorker.status).toBe(403)
      const a = await admin()
      const noReason = await call(
        moderateRoute,
        req('/', { method: 'PATCH', cookie: a.cookie, body: { action: 'HIDE', reason: 'no' } }),
        withId(reviewId),
      )
      expect(noReason.status).toBe(400)
    })
  })

  describe('favorites', () => {
    it('saves and removes professionals idempotently, listing only bookable ones', async () => {
      const job = await world.completed()
      const other = await world.worker()
      for (const id of [job.w.workerId, job.w.workerId, other.workerId]) {
        expect(
          (
            await call(saveRoute, req('/', { method: 'PUT', cookie: job.c.cookie }), {
              params: Promise.resolve({ workerId: id }),
            })
          ).status,
        ).toBe(200)
      }
      let list = (await json(await call(favoritesRoute, req('/', { cookie: job.c.cookie }))))
        .favorites
      expect(list).toHaveLength(2)
      const saved = list.find((f: { workerId: string }) => f.workerId === job.w.workerId)
      expect(saved.lastJob).toMatchObject({ serviceName: 'Tap repair' })

      await sql`update users set status = 'SUSPENDED' where id = ${other.userId}`
      list = (await json(await call(favoritesRoute, req('/', { cookie: job.c.cookie })))).favorites
      expect(list.map((f: { workerId: string }) => f.workerId)).toEqual([job.w.workerId])

      for (let i = 0; i < 2; i++) {
        const res = await call(unsaveRoute, req('/', { method: 'DELETE', cookie: job.c.cookie }), {
          params: Promise.resolve({ workerId: job.w.workerId }),
        })
        expect(res.status).toBe(200)
      }
      list = (await json(await call(favoritesRoute, req('/', { cookie: job.c.cookie })))).favorites
      expect(list).toEqual([])
    })

    it('cannot save someone who is not a public professional', async () => {
      const c = await world.customer()
      const pending = await userWithSession(sql, { role: 'WORKER' })
      const res = await call(saveRoute, req('/', { method: 'PUT', cookie: c.cookie }), {
        params: Promise.resolve({ workerId: pending.workerId! }),
      })
      expect(res.status).toBe(404)
      const asWorker = await call(saveRoute, req('/', { method: 'PUT', cookie: pending.cookie }), {
        params: Promise.resolve({ workerId: pending.workerId! }),
      })
      expect(asWorker.status).toBe(403)
    })
  })

  describe('account', () => {
    it('updates the name and an optional email, without revealing taken addresses', async () => {
      const c = await world.customer()
      const ok = await call(
        accountRoute,
        req('/', {
          method: 'PATCH',
          cookie: c.cookie,
          body: { name: 'Priya S', email: 'Priya@Example.com' },
        }),
      )
      expect((await json(ok)).account).toMatchObject({
        name: 'Priya S',
        email: 'priya@example.com',
      })
      const other = await world.customer()
      const taken = await call(
        accountRoute,
        req('/', {
          method: 'PATCH',
          cookie: other.cookie,
          body: { name: 'Neha', email: 'priya@example.com' },
        }),
      )
      expect(taken.status).toBe(409)
      expect((await json(taken)).error.code).toBe('EMAIL_UNAVAILABLE')
      const cleared = await call(
        accountRoute,
        req('/', { method: 'PATCH', cookie: c.cookie, body: { name: 'Priya S', email: '' } }),
      )
      expect((await json(cleared)).account.email).toBeNull()

      // Renaming keeps a verified address verified.
      await sql`update users set email = 'priya@example.com', email_verified = true where id = ${c.userId}`
      await call(
        accountRoute,
        req('/', {
          method: 'PATCH',
          cookie: c.cookie,
          body: { name: 'Priya Sharma', email: 'priya@example.com' },
        }),
      )
      const [u] = await sql`select email_verified from users where id = ${c.userId}`
      expect(u.email_verified).toBe(true)
    })
  })
})
