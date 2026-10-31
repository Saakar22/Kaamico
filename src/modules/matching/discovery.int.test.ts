import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as categoryRoute } from '@/app/api/v1/categories/[slug]/route'
import { GET as localitiesRoute } from '@/app/api/v1/localities/route'
import { GET as availabilityRoute } from '@/app/api/v1/professionals/[id]/availability/route'
import { GET as reviewsRoute } from '@/app/api/v1/professionals/[id]/reviews/route'
import { GET as profileRoute } from '@/app/api/v1/professionals/[id]/route'
import { GET as professionalsRoute } from '@/app/api/v1/search/professionals/route'
import { GET as searchRoute } from '@/app/api/v1/search/route'
import { fromIst } from '@/lib/time'
import { queryTokens, searchServices } from '@/modules/catalog/catalog'
import { connectTestDb, fixtures, hasTestDatabase, truncateAll } from '@/test/db'
import { searchProfessionals } from './search'

// Customer in Kothrud, Pune. 0.009° of latitude ≈ 1 km.
const HOME = { lat: 18.5074, lng: 73.8077 }
const KM = 0.009
const ORIGIN = 'http://localhost:3000'
// A Monday 10:00 IST; tests pass it as "now" so schedules are deterministic.
const MONDAY_10 = fromIst(2026, 10, 26, 10 * 60)

const get = (path: string) => new Request(ORIGIN + path, { headers: { origin: ORIGIN } })
const withParams = <T extends Record<string, string>>(params: T) => ({
  params: Promise.resolve(params),
})
// Response bodies are asserted field by field, so a loose type keeps the tests readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as Record<string, any>

describe.skipIf(!hasTestDatabase)('discovery: catalog, matching and profiles', () => {
  const sql = connectTestDb()
  let phoneSeq = 0
  let categoryId: string
  let serviceId: string

  type WorkerOptions = {
    northKm?: number
    radiusKm?: number
    status?: 'VERIFIED' | 'PENDING' | 'UNVERIFIED'
    pricePaise?: number
    online?: boolean
    lastActiveMinutesAgo?: number
    completedJobs?: number
    ratingSum?: number
    ratingCount?: number
    pausedUntil?: Date
    /** Weekly windows; defaults to Mon–Sat 09:00–18:00. */
    rules?: { weekday: number; start: number; end: number }[]
    name?: string
  }

  async function worker(opts: WorkerOptions = {}) {
    const phone = `+9197${String(++phoneSeq).padStart(8, '0')}`
    const name = opts.name ?? `Worker ${phoneSeq}`
    const [u] = await sql`insert into users (phone, name, roles)
      values (${phone}, ${name}, '{WORKER}') returning id`
    const lastActive = new Date(MONDAY_10.getTime() - (opts.lastActiveMinutesAgo ?? 2) * 60_000)
    const [w] = await sql`insert into worker_profiles (user_id, display_name, verification_status,
        base_lat, base_lng, service_radius_km, is_online, last_active_at, completed_jobs,
        rating_sum, rating_count, paused_until, created_at)
      values (${u.id}, ${name}, ${opts.status ?? 'VERIFIED'}, ${HOME.lat + (opts.northKm ?? 1) * KM},
        ${HOME.lng}, ${opts.radiusKm ?? 10}, ${opts.online ?? false}, ${lastActive},
        ${opts.completedJobs ?? 20}, ${opts.ratingSum ?? 90}, ${opts.ratingCount ?? 20},
        ${opts.pausedUntil ?? null}, now() - interval '30 days')
      returning id`
    await sql`insert into worker_skills (worker_id, category_id) values (${w.id}, ${categoryId})`
    await sql`insert into worker_service_pricing (worker_id, service_id, price_paise, min_charge_paise, unit)
      values (${w.id}, ${serviceId}, ${opts.pricePaise ?? 40000}, 20000, 'PER_VISIT')`
    const rules =
      opts.rules ?? [0, 1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: 540, end: 1080 }))
    for (const r of rules) {
      await sql`insert into worker_availability_rules (worker_id, weekday, start_minute, end_minute)
        values (${w.id}, ${r.weekday}, ${r.start}, ${r.end})`
    }
    return { workerId: w.id as string, userId: u.id as string }
  }

  const search = (extra: Record<string, string> = {}, now = MONDAY_10) =>
    searchProfessionals({ serviceId, lat: String(HOME.lat), lng: String(HOME.lng), ...extra }, now)

  beforeEach(async () => {
    await truncateAll(sql)
    const [c] = await sql`insert into service_categories (slug, name, icon_key, sort_order)
      values ('plumbing', 'Plumbing', 'wrench', 1) returning id`
    categoryId = c.id
    const [s] = await sql`insert into services (category_id, slug, name, description,
        pricing_unit, typical_duration_min, search_terms, reference_min_paise, reference_max_paise)
      values (${categoryId}, 'tap-repair', 'Tap repair', 'Fix a dripping tap.', 'PER_ITEM', 60,
        'plumber nal tap leak', 15000, 35000)
      returning id`
    serviceId = s.id
  })
  afterAll(async () => {
    await sql.end()
  })

  describe('candidate filtering', () => {
    it('includes only verified, active, unpaused workers with the skill and an active price', async () => {
      const ok = await worker()
      await worker({ status: 'PENDING' })
      await worker({ status: 'UNVERIFIED' })
      await worker({ pausedUntil: new Date(MONDAY_10.getTime() + 3_600_000) })
      const suspended = await worker()
      await sql`update users set status = 'SUSPENDED' where id = ${suspended.userId}`
      const skillRemoved = await worker()
      await sql`delete from worker_skills where worker_id = ${skillRemoved.workerId}`
      const priceOff = await worker()
      await sql`update worker_service_pricing set is_active = false where worker_id = ${priceOff.workerId}`

      const result = await search()
      expect(result.items.map((i) => i.workerId)).toEqual([ok.workerId])
    })

    it("respects the worker's own travel radius", async () => {
      await worker({ northKm: 4, radiusKm: 3 })
      const willing = await worker({ northKm: 4, radiusKm: 5 })
      const result = await search()
      expect(result.items.map((i) => i.workerId)).toEqual([willing.workerId])
    })

    it('never returns private fields such as base location or phone', async () => {
      await worker()
      const [item] = (await search()).items
      expect(Object.keys(item)).not.toEqual(
        expect.arrayContaining(['baseLat', 'baseLng', 'phone', 'userId']),
      )
      expect(JSON.stringify(item)).not.toContain('+9197')
    })
  })

  describe('radius expansion', () => {
    it('widens from 3 km until five candidates are found', async () => {
      await worker({ northKm: 1 })
      await worker({ northKm: 2 })
      for (const km of [4, 4.2, 4.5]) await worker({ northKm: km })
      await worker({ northKm: 7 })
      const result = await search()
      expect(result.radiusKm).toBe(5)
      expect(result.total).toBe(5)
    })

    it('stops at the 12 km city cap', async () => {
      await worker({ northKm: 11, radiusKm: 15 })
      await worker({ northKm: 14, radiusKm: 15 })
      const result = await search()
      expect(result.radiusKm).toBe(12)
      expect(result.total).toBe(1)
    })
  })

  describe('availability', () => {
    it('on-demand needs an online, recently active worker who is free now', async () => {
      const ready = await worker({ online: true, lastActiveMinutesAgo: 3 })
      await worker({ online: true, lastActiveMinutesAgo: 40 })
      await worker({ online: false })
      const busy = await worker({ online: true })
      const f = fixtures(sql)
      const customerId = await f.customer()
      const b = await f.booking({ customerId, categoryId, serviceId, workerId: busy.workerId })
      await f.confirm({
        ...b,
        workerId: busy.workerId,
        start: new Date(MONDAY_10.getTime() + 30 * 60_000),
      })

      const result = await search({ when: 'now' })
      expect(result.items.map((i) => i.workerId)).toEqual([ready.workerId])
      expect(result.items[0].availability.now).toBe(true)
      expect(result.items[0].approxArrival).toMatchObject({ basis: 'straight_line_estimate' })
    })

    it('suggests the earliest scheduled slots when nobody is free right now', async () => {
      const later = await worker({ online: false })
      const result = await search({ when: 'now' })
      expect(result.items).toEqual([])
      expect(result.scheduledAlternatives).toEqual([
        // Earliest start is now + 1 h lead, on the 30-minute grid.
        {
          workerId: later.workerId,
          displayName: expect.any(String),
          start: fromIst(2026, 10, 26, 11 * 60).toISOString(),
        },
      ])
    })

    it('scheduled search checks weekly hours, time off and bookings', async () => {
      const tuesday3pm = fromIst(2026, 10, 27, 15 * 60)
      const free = await worker()
      await worker({ rules: [{ weekday: 1, start: 540, end: 900 }] }) // ends 15:00
      const off = await worker()
      await sql`insert into worker_time_off (worker_id, period)
        values (${off.workerId}, tstzrange(${fromIst(2026, 10, 27, 14 * 60)}, ${fromIst(2026, 10, 27, 20 * 60)}))`

      const result = await search({ when: tuesday3pm.toISOString() })
      expect(result.items.map((i) => i.workerId)).toEqual([free.workerId])
      expect(result.items[0].availability.nextSlot).toBe(tuesday3pm.toISOString())
      expect(result.items[0].approxArrival).toBeNull()
    })

    it('"any time" lists workers with free hours this week, showing their next slot', async () => {
      const withHours = await worker()
      await worker({ rules: [] })
      const result = await search()
      expect(result.items.map((i) => i.workerId)).toEqual([withHours.workerId])
      expect(result.items[0].availability).toEqual({
        now: false,
        nextSlot: fromIst(2026, 10, 26, 11 * 60).toISOString(),
      })
    })

    it('rejects times in the past or more than 30 days ahead', async () => {
      await expect(search({ when: '2026-10-01T10:00:00+05:30' })).rejects.toMatchObject({
        code: 'WHEN_IN_PAST',
      })
      await expect(search({ when: '2027-01-30T10:00:00+05:30' })).rejects.toMatchObject({
        code: 'WHEN_TOO_FAR',
      })
    })
  })

  describe('ranking, sorting and filters', () => {
    it('sorts by price and applies price and rating filters', async () => {
      const cheap = await worker({ pricePaise: 30000, ratingSum: 70, ratingCount: 20 }) // 3.5
      const mid = await worker({ pricePaise: 45000, ratingSum: 96, ratingCount: 20 }) // 4.8
      const pricey = await worker({ pricePaise: 60000, ratingSum: 90, ratingCount: 20 }) // 4.5

      const byPrice = await search({ sort: 'price' })
      expect(byPrice.items.map((i) => i.workerId)).toEqual([
        cheap.workerId,
        mid.workerId,
        pricey.workerId,
      ])

      const affordable = await search({ maxPricePaise: '50000' })
      expect(affordable.items.map((i) => i.workerId).sort()).toEqual(
        [cheap.workerId, mid.workerId].sort(),
      )

      const wellRated = await search({ minRating: '4.5', sort: 'rating' })
      expect(wellRated.items.map((i) => i.workerId)).toEqual([mid.workerId, pricey.workerId])
    })

    it('labels new workers and pages with a cursor', async () => {
      for (let i = 0; i < 3; i++) await worker({ northKm: 1 + i * 0.1 })
      await worker({ completedJobs: 0, ratingSum: 0, ratingCount: 0, northKm: 2 })
      const first = await search({ limit: '2' })
      expect(first.items).toHaveLength(2)
      expect(first.nextCursor).toBe('2')
      const second = await search({ limit: '2', cursor: first.nextCursor! })
      const all = [...first.items, ...second.items]
      expect(new Set(all.map((i) => i.workerId)).size).toBe(4)
      expect(all.filter((i) => i.isNew)).toHaveLength(1)
      expect(second.nextCursor).toBeNull()
    })
  })

  describe('HTTP API', () => {
    it('validates the query and 404s unknown services', async () => {
      const outside = await professionalsRoute(
        get(`/api/v1/search/professionals?serviceId=${serviceId}&lat=51.5&lng=-0.12`),
        {},
      )
      expect(outside.status).toBe(400)
      const unknown = await professionalsRoute(
        get(
          `/api/v1/search/professionals?serviceId=${randomUUID()}&lat=${HOME.lat}&lng=${HOME.lng}`,
        ),
        {},
      )
      expect(unknown.status).toBe(404)
      expect((await json(unknown)).error.code).toBe('NOT_FOUND')
    })

    it('finds services by synonym, with a substring fallback', async () => {
      expect((await searchServices('nal')).map((s) => s.name)).toEqual(['Tap repair'])
      expect((await searchServices('PLUMB')).map((s) => s.name)).toEqual(['Tap repair'])
      // "lumb" is not a word prefix, so only the substring fallback finds it.
      expect((await searchServices('lumb')).map((s) => s.name)).toEqual(['Tap repair'])
      const res = await searchRoute(get('/api/v1/search?q=x'), {})
      expect(res.status).toBe(400)
    })

    it('finds services by their Hindi names and shows Hindi text when asked', async () => {
      await sql`update services set name_hi = 'नल की मरम्मत', search_terms = search_terms || ' नल की मरम्मत'`
      await sql`update service_categories set name_hi = 'प्लंबिंग'`
      // Devanagari vowel signs stay inside the word ("मरम्मत" is one token, not three).
      expect(queryTokens('नल की मरम्मत')).toEqual(['नल', 'की', 'मरम्मत'])
      expect(await searchServices('मरम्मत', 10, 'hi')).toEqual([
        expect.objectContaining({
          name: 'नल की मरम्मत',
          category: expect.objectContaining({ name: 'प्लंबिंग' }),
        }),
      ])
      // English stays the default, and a missing Hindi name falls back to English.
      expect((await searchServices('नल')).map((s) => s.name)).toEqual(['Tap repair'])
      await sql`update services set name_hi = null`
      expect((await searchServices('नल', 10, 'hi')).map((s) => s.name)).toEqual(['Tap repair'])
    })

    it('caps public searches per IP address', async () => {
      const fromIp = (ip: string) =>
        new Request(`${ORIGIN}/api/v1/search?q=x`, {
          headers: { origin: ORIGIN, 'x-forwarded-for': ip },
        })
      for (let i = 0; i < 120; i++) {
        expect((await searchRoute(fromIp('198.51.100.4'), {})).status).toBe(400)
      }
      const limited = await searchRoute(fromIp('198.51.100.4'), {})
      expect(limited.status).toBe(429)
      expect((await json(limited)).error.code).toBe('RATE_LIMITED')
      expect((await searchRoute(fromIp('198.51.100.5'), {})).status).toBe(400)
    })

    it('shows nearby price ranges only when at least three professionals price a service', async () => {
      const path = `/api/v1/categories/plumbing?lat=${HOME.lat}&lng=${HOME.lng}`
      await worker({ pricePaise: 30000 })
      await worker({ pricePaise: 50000 })
      const two = await json(await categoryRoute(get(path), withParams({ slug: 'plumbing' })))
      expect(two.category.services[0].nearbyPriceRange).toBeNull()

      await worker({ pricePaise: 70000 })
      await worker({ pricePaise: 90000, northKm: 11, radiusKm: 15 }) // beyond 10 km
      const three = await json(await categoryRoute(get(path), withParams({ slug: 'plumbing' })))
      expect(three.category.services[0].nearbyPriceRange).toEqual({
        minPaise: 30000,
        medianPaise: 50000,
        maxPaise: 70000,
        workerCount: 3,
      })

      const missing = await categoryRoute(
        get('/api/v1/categories/nope'),
        withParams({ slug: 'nope' }),
      )
      expect(missing.status).toBe(404)
    })

    it('serves public profiles only for verified professionals, without private data', async () => {
      const verified = await worker({ name: 'Rakesh Patil' })
      const pending = await worker({ status: 'PENDING' })

      const res = await profileRoute(get('/'), withParams({ id: verified.workerId }))
      expect(res.status).toBe(200)
      const body = await json(res)
      expect(body.professional).toMatchObject({
        displayName: 'Rakesh Patil',
        rating: { avg: 4.5, count: 20 },
        services: [{ name: 'Tap repair', pricePaise: 40000 }],
      })
      const text = JSON.stringify(body)
      for (const secret of ['base_lat', 'baseLat', '+9197', 'phone'])
        expect(text).not.toContain(secret)

      for (const id of [pending.workerId, randomUUID(), 'not-a-uuid']) {
        const hidden = await profileRoute(get('/'), withParams({ id }))
        expect(hidden.status).toBe(404)
      }
    })

    it('lists published reviews with a histogram, hiding the full customer name', async () => {
      const w = await worker()
      const f = fixtures(sql)
      for (const [rating, status] of [
        [5, 'PUBLISHED'],
        [4, 'PUBLISHED'],
        [1, 'HIDDEN'],
      ] as const) {
        const customerId = await f.customer()
        await sql`update users set name = 'Priya Sharma' where id = ${customerId}`
        const b = await f.booking({ customerId, categoryId, serviceId, workerId: w.workerId })
        await f.confirm({
          ...b,
          workerId: w.workerId,
          start: new Date(Date.now() - 86_400_000 * (2 + rating)),
        })
        await sql`update bookings set status = 'COMPLETED', completed_at = now() where id = ${b.bookingId}`
        await sql`insert into reviews (booking_id, customer_id, worker_id, rating, comment, status)
          values (${b.bookingId}, ${customerId}, ${w.workerId}, ${rating}, 'Good work', ${status})`
      }
      const body = await json(await reviewsRoute(get('/'), withParams({ id: w.workerId })))
      expect(body.histogram).toEqual({ 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 })
      expect(body.items.map((r: { rating: number }) => r.rating).sort()).toEqual([4, 5])
      expect(body.items[0]).toMatchObject({ author: 'Priya S.', serviceName: 'Tap repair' })
    })

    it('returns free slots for a day and rejects bad dates', async () => {
      const w = await worker({ rules: [{ weekday: 1, start: 600, end: 720 }] }) // Tue 10–12
      const res = await availabilityRoute(
        get(
          `/api/v1/professionals/${w.workerId}/availability?serviceId=${serviceId}&date=2026-11-03`,
        ),
        withParams({ id: w.workerId }),
      )
      expect(res.status).toBe(200)
      const body = await json(res)
      // Tuesday 3 Nov, 60-minute job: 10:00, 10:30 and 11:00 fit before 12:00.
      expect(body.slots.map((s: { start: string }) => s.start)).toEqual(
        [600, 630, 660].map((m) => fromIst(2026, 11, 3, m).toISOString()),
      )
      const bad = await availabilityRoute(
        get(`/api/v1/professionals/${w.workerId}/availability?date=2026-02-31`),
        withParams({ id: w.workerId }),
      )
      expect(bad.status).toBe(400)
    })

    it('finds the nearest locality and flags points outside the service area', async () => {
      await sql`insert into localities (city, name, pincode, lat, lng)
        values ('Pune', 'Kothrud', '411038', 18.5074, 73.8077), ('Pune', 'Baner', '411045', 18.559, 73.7868)`
      const near = await json(
        await localitiesRoute(get('/api/v1/localities?lat=18.51&lng=73.81'), {}),
      )
      expect(near).toMatchObject({ nearest: { name: 'Kothrud' }, inServiceArea: true })
      const far = await json(
        await localitiesRoute(get('/api/v1/localities?lat=28.61&lng=77.2'), {}),
      )
      expect(far.inServiceArea).toBe(false)
      const list = await json(await localitiesRoute(get('/api/v1/localities?city=pune&q=ban'), {}))
      expect(list.localities.map((l: { name: string }) => l.name)).toEqual(['Baner'])
    })
  })
})
