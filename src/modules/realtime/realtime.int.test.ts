import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as eventsRoute } from '@/app/api/v1/events/route'
import { createBooking } from '@/modules/bookings/create'
import { ORIGIN } from '@/test/api'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import { CHANNEL, deliver, subscribeLocal, type LiveEvent } from './hub'

describe.skipIf(!hasTestDatabase)('live updates', () => {
  const sql = connectTestDb()
  let world: Awaited<ReturnType<typeof bookingWorld>>

  beforeEach(async () => {
    await truncateAll(sql)
    world = await bookingWorld(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  it('announces committed booking changes to both parties, and notifications to their owner', async () => {
    const listener = postgres(process.env.DATABASE_URL_TEST!, { max: 1, onnotice: () => {} })
    const heard: { type: string; bookingId?: string; users: string[] }[] = []
    try {
      await listener.listen(CHANNEL, (payload) => heard.push(JSON.parse(payload)))
      const w = await world.worker()
      const c = await world.customer()

      // A rolled-back change is never announced.
      await sql
        .begin(async (tx) => {
          await tx`insert into notifications (user_id, type, title) values (${c.userId}, 't', 'x')`
          throw new Error('rollback')
        })
        .catch(() => undefined)

      const { bookingId } = await createBooking(c.actor, world.request(c, w), randomUUID())
      await sql`insert into notifications (user_id, type, title) values (${c.userId}, 'test', 'Hi')`
      await expect.poll(() => heard.length, { timeout: 5_000 }).toBeGreaterThan(1)

      const aboutBooking = heard.filter((e) => e.type === 'booking' && e.bookingId === bookingId)
      expect(aboutBooking.length).toBeGreaterThan(0)
      expect(aboutBooking.at(-1)!.users.sort()).toEqual([c.userId, w.userId].sort())
      const notes = heard.filter((e) => e.type === 'notification')
      expect(notes).toEqual([{ type: 'notification', users: [c.userId] }])
    } finally {
      await listener.end()
    }
  })

  it('passes each event only to the users it names', () => {
    const a = randomUUID()
    const b = randomUUID()
    const gotA: LiveEvent[] = []
    const gotB: LiveEvent[] = []
    const offA = subscribeLocal(a, (e) => gotA.push(e))
    const offB = subscribeLocal(b, (e) => gotB.push(e))
    const bookingId = randomUUID()
    expect(deliver(JSON.stringify({ type: 'booking', bookingId, users: [a] }))).toBe(1)
    expect(gotA).toEqual([{ type: 'booking', bookingId }])
    expect(gotB).toEqual([])
    expect(deliver('not json')).toBe(0)
    offA()
    expect(deliver(JSON.stringify({ type: 'notification', users: [a, b] }))).toBe(1)
    offB()
  })

  it('a stale unsubscribe never drops a newer stream for the same person', () => {
    const user = randomUUID()
    const off1 = subscribeLocal(user, () => {})
    off1()
    const got: LiveEvent[] = []
    const off2 = subscribeLocal(user, (e) => got.push(e))
    off1() // the old stream's late cleanup
    expect(deliver(JSON.stringify({ type: 'notification', users: [user] }))).toBe(1)
    expect(got).toHaveLength(1)
    off2()
  })

  it('streams only to a signed-in person, starting with a ready event', async () => {
    const anonymous = await eventsRoute(new Request(`${ORIGIN}/api/v1/events`), {})
    expect(anonymous.status).toBe(401)

    const c = await world.customer()
    const abort = new AbortController()
    const res = await eventsRoute(
      new Request(`${ORIGIN}/api/v1/events`, {
        headers: { cookie: c.cookie },
        signal: abort.signal,
      }),
      {},
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const reader = res.body!.getReader()
    const first = new TextDecoder().decode((await reader.read()).value)
    expect(first).toContain('event: ready')
    abort.abort()
    await reader.cancel()
  })
})
