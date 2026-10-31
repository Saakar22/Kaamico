import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { DELETE as unblockRoute, PUT as blockRoute } from '@/app/api/v1/blocks/[workerId]/route'
import { GET as blockedRoute } from '@/app/api/v1/blocks/route'
import { GET as searchRoute } from '@/app/api/v1/search/professionals/route'
import { createBooking } from '@/modules/bookings/create'
import { createQuickMatch } from '@/modules/bookings/quick-match'
import { call, json, req } from '@/test/api'
import { bookingWorld, KOTHRUD } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import { saveFavorite } from './favorites'

describe.skipIf(!hasTestDatabase)('blocking professionals', () => {
  const sql = connectTestDb()
  let world: Awaited<ReturnType<typeof bookingWorld>>

  beforeEach(async () => {
    await truncateAll(sql)
    world = await bookingWorld(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  type C = Awaited<ReturnType<typeof world.customer>>
  const block = (c: C, workerId: string, method: 'PUT' | 'DELETE' = 'PUT') =>
    call(method === 'PUT' ? blockRoute : unblockRoute, req('/', { method, cookie: c.cookie }), {
      params: Promise.resolve({ workerId }),
    })
  const searchIds = async (cookie?: string) => {
    const url = `/?serviceId=${world.serviceId}&lat=${KOTHRUD.lat}&lng=${KOTHRUD.lng}`
    const body = await json(await call(searchRoute, req(url, { cookie })))
    return body.items.map((p: { workerId: string }) => p.workerId) as string[]
  }

  it('hides a blocked professional from that customer only, and unsaves them', async () => {
    const [a, b] = [await world.worker(), await world.worker()]
    const c = await world.customer()
    const other = await world.customer()
    await saveFavorite(c.actor, a.workerId)

    for (let i = 0; i < 2; i++) expect((await block(c, a.workerId)).status).toBe(200)
    expect(await sql`select 1 from favorites where customer_id = ${c.userId}`).toHaveLength(0)

    expect(await searchIds(c.cookie)).toEqual([b.workerId])
    expect((await searchIds(other.cookie)).sort()).toEqual([a.workerId, b.workerId].sort())
    expect((await searchIds()).sort()).toEqual([a.workerId, b.workerId].sort())

    const list = (await json(await call(blockedRoute, req('/', { cookie: c.cookie })))).blocked
    expect(list).toMatchObject([{ workerId: a.workerId, displayName: 'Rakesh Patil' }])

    for (let i = 0; i < 2; i++) expect((await block(c, a.workerId, 'DELETE')).status).toBe(200)
    expect((await searchIds(c.cookie)).sort()).toEqual([a.workerId, b.workerId].sort())
  })

  it('refuses new requests to a blocked professional and leaves them out of quick match', async () => {
    const [a, b] = [await world.worker(), await world.worker()]
    const c = await world.customer()
    await block(c, a.workerId)

    await expect(createBooking(c.actor, world.request(c, a), randomUUID())).rejects.toMatchObject({
      code: 'WORKER_BLOCKED',
    })
    const { bookingId, invited } = await createQuickMatch(
      c.actor,
      { mode: 'BROADCAST', serviceId: world.serviceId, addressId: c.addressId },
      randomUUID(),
    )
    expect(invited).toBe(1)
    const rows =
      await sql`select worker_id from booking_invitations where booking_id = ${bookingId}`
    expect(rows.map((r) => r.worker_id)).toEqual([b.workerId])
  })

  it('only lets customers block, and only listed professionals', async () => {
    const a = await world.worker()
    const pro = await world.worker()
    expect(
      (
        await call(blockRoute, req('/', { method: 'PUT', cookie: pro.cookie }), {
          params: Promise.resolve({ workerId: a.workerId }),
        })
      ).status,
    ).toBe(403)
    const c = await world.customer()
    expect((await block(c, randomUUID())).status).toBe(404)
    expect((await block(c, 'not-a-uuid')).status).toBe(404)
  })
})
