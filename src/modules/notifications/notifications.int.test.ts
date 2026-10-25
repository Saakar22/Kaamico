import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as sweepRoute } from '@/app/api/internal/sweep/route'
import { POST as readRoute } from '@/app/api/v1/notifications/read/route'
import { GET as listRoute } from '@/app/api/v1/notifications/route'
import { GET as unreadRoute } from '@/app/api/v1/notifications/unread-count/route'
import { createBooking } from '@/modules/bookings/create'
import { transition } from '@/modules/bookings/lifecycle'
import { acceptOffer, makeOffer } from '@/modules/negotiation/offers'
import { call, json, req } from '@/test/api'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import { dispatchOutbox, MAX_ATTEMPTS } from './dispatcher'

describe.skipIf(!hasTestDatabase)('notifications', () => {
  const sql = connectTestDb()
  let world: Awaited<ReturnType<typeof bookingWorld>>

  beforeEach(async () => {
    await truncateAll(sql)
    world = await bookingWorld(sql)
  })
  afterAll(async () => {
    await sql`drop trigger if exists fail_notifications on notifications`
    await sql.end()
  })

  const inbox = async (userId: string) =>
    sql`select type, title, link from notifications where user_id = ${userId} order by id`
  const version = async (id: string) =>
    (await sql`select version from bookings where id = ${id}`)[0].version as number

  it('delivers each outbox event once, to the other side, with role-specific links', async () => {
    const w = await world.worker()
    const c = await world.customer()
    const { bookingId } = await createBooking(
      c.actor,
      world.request(c, w, { priceDecision: { type: 'OFFER', amountPaise: 40000 } }),
      world.key(),
    )
    const [inv] = await sql`select id from booking_invitations where booking_id = ${bookingId}`

    expect(await dispatchOutbox()).toMatchObject({ processed: 1, notifications: 1, failed: 0 })
    expect(await inbox(w.userId)).toEqual([
      {
        type: 'booking.requested',
        title: 'New request: Tap repair',
        link: `/worker/requests/${inv.id}`,
      },
    ])
    // Exactly once: a second run finds nothing to do.
    expect(await dispatchOutbox()).toMatchObject({ processed: 0, notifications: 0 })

    await makeOffer(w.actor, bookingId, { amountPaise: 46000 })
    const [offer] = await sql`select id from price_offers where status = 'PENDING'`
    await acceptOffer(c.actor, offer.id, { expectedBookingVersion: await version(bookingId) })
    await sql`update bookings set slot = tstzrange(now() + interval '30 minutes', now() + interval '2 hours') where id = ${bookingId}`
    await transition(w.actor, bookingId, {
      to: 'EN_ROUTE',
      expectedVersion: await version(bookingId),
    })
    await dispatchOutbox()

    expect(await inbox(c.userId)).toEqual([
      {
        type: 'offer.created',
        title: 'Rakesh offered ₹460',
        link: `/bookings/${bookingId}/negotiate`,
      },
      { type: 'booking.en_route', title: 'Rakesh is on the way', link: `/bookings/${bookingId}` },
    ])
    // The customer accepted, so only the professional hears about the confirmation.
    expect((await inbox(w.userId)).map((n) => n.type)).toEqual([
      'booking.requested',
      'booking.confirmed',
    ])
    expect((await inbox(w.userId))[1].link).toBe(`/worker/bookings/${bookingId}`)
  })

  it('backs off failed events and parks them after the last attempt', async () => {
    const w = await world.worker()
    const c = await world.customer()
    await createBooking(c.actor, world.request(c, w), world.key())
    await sql`create or replace function kaamico_test_fail() returns trigger language plpgsql
      as $$ begin raise exception 'inbox unavailable'; end $$`
    await sql`create trigger fail_notifications before insert on notifications
      for each row execute function kaamico_test_fail()`
    try {
      const now = new Date()
      expect(await dispatchOutbox({ now })).toMatchObject({ processed: 0, failed: 1 })
      const [e] =
        await sql`select attempts, last_error, available_at, processed_at from outbox_events`
      expect(e).toMatchObject({ attempts: 1, processed_at: null })
      expect(e.last_error).toContain('inbox unavailable')
      expect(new Date(e.available_at).getTime()).toBe(now.getTime() + 60_000)
      // Not retried before its time.
      expect(await dispatchOutbox({ now })).toMatchObject({ failed: 0, processed: 0 })

      let t = now.getTime()
      for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
        t += 2 ** (attempt - 1) * 60_000
        await dispatchOutbox({ now: new Date(t) })
      }
      const [parked] = await sql`select attempts, processed_at from outbox_events`
      expect(parked.attempts).toBe(MAX_ATTEMPTS)
      expect(parked.processed_at).not.toBeNull()
    } finally {
      await sql`drop trigger if exists fail_notifications on notifications`
    }
    expect(await inbox(w.userId)).toEqual([])
  })

  it('skips topics without in-app messages and bookings that no longer resolve', async () => {
    await sql`insert into outbox_events (topic, payload) values
      ('verification.submitted', '{"workerId": "x"}'),
      ('booking.requested', '{"bookingId": "not-a-uuid"}')`
    expect(await dispatchOutbox()).toMatchObject({ processed: 2, notifications: 0, failed: 0 })
  })

  it('serves, counts and marks only the signed-in user’s notifications', async () => {
    const w = await world.worker()
    const c = await world.customer()
    const other = await world.customer()
    for (let i = 0; i < 23; i++) {
      await sql`insert into notifications (user_id, type, title, link)
        values (${c.userId}, 'test', ${`Note ${i}`}, '/bookings')`
    }
    await sql`insert into notifications (user_id, type, title) values (${other.userId}, 'test', 'Not yours')`
    // Lazy delivery: reading the count delivers pending events too.
    await createBooking(c.actor, world.request(c, w), world.key())
    const count = await call(
      unreadRoute,
      req('/api/v1/notifications/unread-count', { cookie: w.cookie }),
    )
    expect(await json(count)).toEqual({ unread: 1 })

    const first = await json(
      await call(listRoute, req('/api/v1/notifications', { cookie: c.cookie })),
    )
    expect(first.notifications).toHaveLength(20)
    expect(first.notifications[0].title).toBe('Note 22')
    expect(first.unread).toBe(23)
    const second = await json(
      await call(
        listRoute,
        req(`/api/v1/notifications?cursor=${first.nextCursor}`, { cookie: c.cookie }),
      ),
    )
    expect(second.notifications.map((n: { title: string }) => n.title)).toEqual([
      'Note 2',
      'Note 1',
      'Note 0',
    ])
    expect(second.nextCursor).toBeNull()

    const [theirs] = await sql`select id from notifications where user_id = ${other.userId}`
    const marked = await call(
      readRoute,
      req('/api/v1/notifications/read', {
        cookie: c.cookie,
        body: { ids: [first.notifications[0].id, theirs.id] },
      }),
    )
    expect(await json(marked)).toEqual({ unread: 22 })
    expect(
      (await sql`select read_at from notifications where id = ${theirs.id}`)[0].read_at,
    ).toBeNull()

    const all = await call(
      readRoute,
      req('/api/v1/notifications/read', { cookie: c.cookie, body: { all: true } }),
    )
    expect(await json(all)).toEqual({ unread: 0 })
    const bad = await call(
      readRoute,
      req('/api/v1/notifications/read', { cookie: c.cookie, body: {} }),
    )
    expect(bad.status).toBe(400)
    expect((await call(unreadRoute, req('/api/v1/notifications/unread-count'))).status).toBe(401)
  })

  it('delivers from the cron sweep', async () => {
    const w = await world.worker()
    const c = await world.customer()
    await createBooking(c.actor, world.request(c, w), world.key())
    const res = await call(
      sweepRoute,
      req('/api/internal/sweep', {
        body: {},
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    )
    expect((await json(res)).dispatched).toMatchObject({ processed: 1, notifications: 1 })
  })
})
