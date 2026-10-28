import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import {
  citySlug,
  getCity,
  getCityCategory,
  listCities,
  listCityCategories,
  listPublicProfessionals,
} from './cities'

describe('citySlug', () => {
  it('makes URL-safe slugs', () => {
    expect(citySlug('Pune')).toBe('pune')
    expect(citySlug('Navi Mumbai')).toBe('navi-mumbai')
    expect(citySlug(' Bengaluru (Urban) ')).toBe('bengaluru-urban')
  })
})

describe.skipIf(!hasTestDatabase)('city pages', () => {
  const sql = connectTestDb()
  let world: Awaited<ReturnType<typeof bookingWorld>>

  beforeEach(async () => {
    await truncateAll(sql)
    world = await bookingWorld(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  /** A verified professional in Kothrud charging `pricePaise` for tap repair. */
  async function pro(pricePaise: number, rating?: { sum: number; count: number }) {
    const w = await world.worker()
    await sql`update worker_service_pricing set price_paise = ${pricePaise}, min_charge_paise = least(min_charge_paise, ${pricePaise}) where worker_id = ${w.workerId}`
    if (rating) {
      await sql`update worker_profiles set rating_sum = ${rating.sum}, rating_count = ${rating.count}
        where id = ${w.workerId}`
    }
    return w
  }

  it('lists only cities, categories and professionals the public may see', async () => {
    const best = await pro(40_000, { sum: 98, count: 20 })
    const fresh = await pro(60_000)
    const hidden = await pro(10_000)
    await sql`update worker_profiles set verification_status = 'PENDING' where id = ${hidden.workerId}`
    const paused = await pro(5_000)
    await sql`update worker_service_pricing set is_active = false where worker_id = ${paused.workerId}`
    await sql`insert into localities (city, name, lat, lng, is_serviceable)
      values ('Nashik', 'Panchavati', 20.0, 73.79, false)`

    const cities = await listCities()
    expect(cities).toEqual([
      expect.objectContaining({ slug: 'pune', name: 'Pune', professionals: 3 }),
    ])
    expect(cities[0].localities.map((l) => l.name)).toEqual(['Hadapsar', 'Kothrud'])
    expect(await getCity('nashik')).toBeNull()

    expect(await listCityCategories('pune')).toEqual([
      expect.objectContaining({ slug: 'plumbing', professionals: 2, fromPaise: 40_000 }),
    ])

    const page = await getCityCategory('pune', 'plumbing')
    expect(page?.services).toEqual([
      expect.objectContaining({
        slug: 'tap-repair',
        professionals: 2,
        lowPaise: 42_000,
        highPaise: 58_000,
        medianPaise: 50_000,
      }),
    ])
    // Ranked by rating, pulled towards the average while reviews are few.
    expect(page?.professionals.map((p) => p.id)).toEqual([best.workerId, fresh.workerId])
    expect(page?.professionals[0]).toMatchObject({ ratingAverage: 4.9, ratingCount: 20 })
    expect(page?.localities).toEqual(['Kothrud'])

    expect(await getCityCategory('pune', 'painting')).toBeNull()
    expect(await getCityCategory('mumbai', 'plumbing')).toBeNull()

    const ids = (await listPublicProfessionals()).map((p) => p.id).sort()
    expect(ids).toEqual([best.workerId, fresh.workerId, paused.workerId].sort())
  })

  it('puts city pages in the sitemap and keeps private areas out of robots.txt', async () => {
    await pro(40_000)
    const urls = (await sitemap()).map((e) => e.url.replace(/^https?:\/\/[^/]+/, ''))
    expect(urls).toEqual(expect.arrayContaining(['/', '/in/pune', '/in/pune/plumbing']))
    const rules = (await robots()).rules
    expect(rules).toMatchObject({
      disallow: expect.arrayContaining(['/admin', '/worker', '/api/']),
    })
  })
})
