import { randomUUID } from 'node:crypto'
import type postgres from 'postgres'
import type { Actor } from '@/modules/auth/types'
import { fromIst, toIstParts } from '@/lib/time'
import { userWithSession } from './api'

/** A bookable world for booking tests: one service, a ready professional and customers with addresses. */

export const KOTHRUD = { lat: 18.5074, lng: 73.8077 }

export function actorFor(
  user: { userId: string; workerId: string | null },
  role: 'CUSTOMER' | 'WORKER',
): Actor {
  return {
    userId: user.userId,
    sessionId: 'test',
    scope: 'USER',
    name: 'Test',
    phone: null,
    email: null,
    roles: [role],
    needsOnboarding: false,
    workerId: user.workerId,
  }
}

export async function bookingWorld(sql: postgres.Sql) {
  const [c] = await sql`insert into service_categories (slug, name, icon_key)
    values ('plumbing', 'Plumbing', 'wrench') returning id`
  const [s] =
    await sql`insert into services (category_id, slug, name, pricing_unit, typical_duration_min)
    values (${c.id}, 'tap-repair', 'Tap repair', 'PER_ITEM', 60) returning id`
  const [l] = await sql`insert into localities (city, name, pincode, lat, lng)
    values ('Pune', 'Kothrud', '411038', ${KOTHRUD.lat}, ${KOTHRUD.lng}) returning id`
  const [far] = await sql`insert into localities (city, name, pincode, lat, lng)
    values ('Pune', 'Hadapsar', '411028', 18.5089, 73.926) returning id`

  async function worker(opts: { radiusKm?: number; online?: boolean; negotiable?: boolean } = {}) {
    const w = await userWithSession(sql, { role: 'WORKER', name: 'Rakesh Patil' })
    await sql`update worker_profiles set verification_status = 'VERIFIED', base_lat = ${KOTHRUD.lat},
        base_lng = ${KOTHRUD.lng}, base_locality_id = ${l.id}, service_radius_km = ${opts.radiusKm ?? 8},
        is_online = ${opts.online ?? true}, last_active_at = now()
      where id = ${w.workerId}`
    await sql`insert into worker_skills (worker_id, category_id) values (${w.workerId}, ${c.id})`
    await sql`insert into worker_service_pricing (worker_id, service_id, price_paise, min_charge_paise, unit, is_negotiable)
      values (${w.workerId}, ${s.id}, 50000, 20000, 'PER_ITEM', ${opts.negotiable ?? true})`
    // Open around the clock, so tests do not depend on the time they run.
    for (let weekday = 0; weekday < 7; weekday++) {
      await sql`insert into worker_availability_rules (worker_id, weekday, start_minute, end_minute)
        values (${w.workerId}, ${weekday}, 0, 1440)`
    }
    return { ...w, workerId: w.workerId!, actor: actorFor(w, 'WORKER') }
  }

  async function customer(opts: { farAway?: boolean } = {}) {
    const u = await userWithSession(sql, { role: 'CUSTOMER', name: 'Priya Sharma' })
    const loc = opts.farAway ? { id: far.id, lat: 18.5089, lng: 73.926 } : { id: l.id, ...KOTHRUD }
    const [a] =
      await sql`insert into addresses (user_id, line1, locality_id, city, state, pincode, lat, lng, is_default)
      values (${u.userId}, 'Flat 302, Sai Residency', ${loc.id}, 'Pune', 'Maharashtra', '411038', ${loc.lat}, ${loc.lng}, true)
      returning id`
    return { ...u, addressId: a.id as string, actor: actorFor(u, 'CUSTOMER') }
  }

  /** 11:00 IST tomorrow: past the lead time and well inside the day, whenever tests run. */
  const tomorrow = () => {
    const { year, month, day } = toIstParts(new Date())
    return fromIst(year, month, day + 1, 11 * 60)
  }

  function request(
    cust: { addressId: string },
    w: { workerId: string },
    overrides: Record<string, unknown> = {},
  ) {
    return {
      serviceId: s.id as string,
      workerId: w.workerId,
      timing: 'SCHEDULED',
      requestedStart: tomorrow().toISOString(),
      addressId: cust.addressId,
      description: 'Kitchen tap is dripping',
      priceDecision: { type: 'ACCEPT_LISTED' },
      ...overrides,
    }
  }

  return {
    serviceId: s.id as string,
    categoryId: c.id as string,
    localityId: l.id as string,
    worker,
    customer,
    request,
    tomorrow,
    key: () => randomUUID(),
  }
}
