import 'server-only'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { waitlistEntries } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { enforceRateLimit } from '@/lib/rate-limit'
import { normalizeIndianMobile } from '@/modules/auth/phone'

const CONTACT_MESSAGE = 'Enter a 10-digit Indian mobile number or an email address'

export const waitlistInput = z.object({
  city: z.string().trim().min(2, 'Enter your city').max(80),
  contact: z.string().trim().min(3, CONTACT_MESSAGE).max(120),
  categoryId: z.uuid().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

/** A mobile number (E.164) or a lower-case email, or null if it is neither. */
export function parseContact(input: string): { contact: string; kind: 'PHONE' | 'EMAIL' } | null {
  const phone = normalizeIndianMobile(input)
  if (phone) return { contact: phone, kind: 'PHONE' }
  const email = input.trim().toLowerCase()
  return z.email().safeParse(email).success ? { contact: email, kind: 'EMAIL' } : null
}

/** Rounds to one decimal place (about 10 km): enough to see demand, not where someone lives. */
const approx = (v: number | undefined) => (v === undefined ? null : Math.round(v * 10) / 10)

/**
 * Adds someone outside the service cities to the waitlist (§4.2). Joining twice for the
 * same city is not an error. Capped per IP, as the form needs no sign-in.
 */
export async function joinWaitlist(raw: unknown, ip: string | null): Promise<{ joined: true }> {
  const input = waitlistInput.parse(raw)
  const contact = parseContact(input.contact)
  if (!contact) {
    throw new AppError('VALIDATION_FAILED', CONTACT_MESSAGE, {
      details: { issues: [{ path: 'contact', message: CONTACT_MESSAGE }] },
    })
  }
  if (ip) {
    await enforceRateLimit(
      `waitlist:ip:${ip}`,
      { limit: 10, windowSeconds: 3600 },
      'Too many sign-ups from here. Please try again later.',
    )
  }
  const cityKey = input.city.toLowerCase().replace(/\s+/g, ' ')
  await getDb()
    .insert(waitlistEntries)
    .values({
      city: input.city,
      cityKey,
      contact: contact.contact,
      contactKind: contact.kind,
      categoryId: input.categoryId ?? null,
      approxLat: approx(input.lat),
      approxLng: approx(input.lng),
    })
    .onConflictDoNothing({ target: [waitlistEntries.contact, waitlistEntries.cityKey] })
  return { joined: true }
}

export type WaitlistDemand = { city: string; people: number; latest: string }[]

/** Cities people are waiting for, most wanted first (admin analytics). */
export async function waitlistDemand(limit = 10): Promise<WaitlistDemand> {
  const rows = await getDb().execute<{ city: string; people: number; latest: Date | string }>(sql`
    select (array_agg(city order by created_at desc))[1] as city, count(*)::int as people,
           max(created_at) as latest
    from waitlist_entries group by city_key
    order by people desc, latest desc
    limit ${limit}`)
  return rows.map((r) => ({
    city: r.city,
    people: r.people,
    latest: new Date(r.latest).toISOString(),
  }))
}
