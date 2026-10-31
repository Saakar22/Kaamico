import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as waitlistRoute } from '@/app/api/v1/waitlist/route'
import { json, req } from '@/test/api'
import { connectTestDb, fixtures, hasTestDatabase, truncateAll } from '@/test/db'
import { joinWaitlist, parseContact, waitlistDemand } from './waitlist'

describe('parseContact', () => {
  it('accepts Indian mobiles and emails only', () => {
    expect(parseContact('098765 43210')).toEqual({ contact: '+919876543210', kind: 'PHONE' })
    expect(parseContact(' Asha@Example.COM ')).toEqual({
      contact: 'asha@example.com',
      kind: 'EMAIL',
    })
    expect(parseContact('12345')).toBeNull()
    expect(parseContact('not an email')).toBeNull()
  })
})

describe.skipIf(!hasTestDatabase)('waitlist outside the service cities', () => {
  const sql = connectTestDb()

  beforeEach(async () => {
    await truncateAll(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  const post = (body: unknown, ip = '203.0.113.7') =>
    waitlistRoute(req('/api/v1/waitlist', { body, headers: { 'x-forwarded-for': ip } }), {})

  it('keeps one entry per person and city, with a rounded location', async () => {
    const { categoryId } = await fixtures(sql).category()
    const res = await post({
      city: '  Nashik ',
      contact: '98765 43210',
      categoryId,
      lat: 19.99751,
      lng: 73.78982,
    })
    expect(res.status).toBe(201)
    expect(await json(res)).toEqual({ joined: true })
    // Same person and city again (different spelling): no second entry, no error.
    expect((await post({ city: 'NASHIK', contact: '+91 98765 43210' })).status).toBe(201)
    expect(
      await sql`select city, city_key, contact, contact_kind, approx_lat, approx_lng, category_id from waitlist_entries`,
    ).toEqual([
      {
        city: 'Nashik',
        city_key: 'nashik',
        contact: '+919876543210',
        contact_kind: 'PHONE',
        approx_lat: 20,
        approx_lng: 73.8,
        category_id: categoryId,
      },
    ])
  })

  it('rejects contacts that are neither a mobile nor an email', async () => {
    const res = await post({ city: 'Nashik', contact: '12345' })
    expect(res.status).toBe(400)
    expect((await json(res)).error.details.issues).toEqual([
      expect.objectContaining({ path: 'contact' }),
    ])
  })

  it('caps sign-ups per IP address', async () => {
    for (let i = 0; i < 10; i++) {
      await joinWaitlist({ city: 'Nashik', contact: `person${i}@example.com` }, '198.51.100.9')
    }
    const res = await post({ city: 'Nashik', contact: 'one.more@example.com' }, '198.51.100.9')
    expect((await json(res)).error.code).toBe('RATE_LIMITED')
  })

  it('ranks the cities people are waiting for', async () => {
    for (const [city, contact] of [
      ['Nashik', 'a@example.com'],
      ['nashik', 'b@example.com'],
      ['Indore', 'c@example.com'],
    ]) {
      await joinWaitlist({ city, contact }, null)
    }
    expect(await waitlistDemand()).toEqual([
      expect.objectContaining({ city: 'nashik', people: 2 }),
      expect.objectContaining({ city: 'Indore', people: 1 }),
    ])
  })
})
