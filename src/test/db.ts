import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

export const hasTestDatabase = Boolean(process.env.DATABASE_URL_TEST)

export function connectTestDb(): postgres.Sql {
  return postgres(process.env.DATABASE_URL_TEST!, { max: 4, onnotice: () => {} })
}

export async function truncateAll(sql: postgres.Sql): Promise<void> {
  const tables = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public'`
  await sql.unsafe(
    `truncate ${tables.map((t) => `"${t.tablename}"`).join(', ')} restart identity cascade`,
  )
}

/** Postgres SQLSTATE codes asserted by the integrity tests. */
export const PG = {
  restrictViolation: '23001',
  uniqueViolation: '23505',
  checkViolation: '23514',
  exclusionViolation: '23P01',
  deadlockDetected: '40P01',
} as const

let phoneSeq = 0
const nextPhone = () => `+9198${String(++phoneSeq).padStart(8, '0')}`
const range = (start: Date, minutes: number) =>
  `[${start.toISOString()},${new Date(start.getTime() + minutes * 60_000).toISOString()})`

/** Builds minimal valid rows for integrity tests. Accepts a pool or a transaction. */
export function fixtures(sql: postgres.Sql | postgres.TransactionSql) {
  async function category() {
    const [c] = await sql`insert into service_categories (slug, name, icon_key)
      values (${'cat-' + randomUUID().slice(0, 8)}, 'Plumbing', 'wrench') returning id`
    const [s] =
      await sql`insert into services (category_id, slug, name, pricing_unit, typical_duration_min)
      values (${c.id}, 'tap-repair', 'Tap repair', 'PER_ITEM', 30) returning id`
    return { categoryId: c.id as string, serviceId: s.id as string }
  }

  async function customer() {
    const [u] =
      await sql`insert into users (phone, name) values (${nextPhone()}, 'Test Customer') returning id`
    return u.id as string
  }

  async function worker(categoryId?: string) {
    const [u] =
      await sql`insert into users (phone, name, roles) values (${nextPhone()}, 'Test Worker', '{WORKER}') returning id`
    const [w] =
      await sql`insert into worker_profiles (user_id, display_name, verification_status, base_lat, base_lng)
      values (${u.id}, 'Test Worker', 'VERIFIED', 18.52, 73.85) returning id`
    if (categoryId)
      await sql`insert into worker_skills (worker_id, category_id) values (${w.id}, ${categoryId})`
    return { workerId: w.id as string, userId: u.id as string }
  }

  /** A REQUESTED booking with an invitation for `workerId`. */
  async function booking(opts: {
    customerId: string
    categoryId: string
    serviceId: string
    workerId: string
  }) {
    const [b] =
      await sql`insert into bookings (code, customer_id, service_id, category_id, timing, requested_start,
        address_snapshot, job_lat, job_lng, locality_label, commission_bps, idempotency_key)
      values (${'T-' + randomUUID().slice(0, 8)}, ${opts.customerId}, ${opts.serviceId}, ${opts.categoryId}, 'SCHEDULED',
        now() + interval '1 day', ${sql.json({ line1: 'x', city: 'Pune', state: 'MH', pincode: '411038' })},
        18.51, 73.81, 'Kothrud, Pune', 1000, ${randomUUID()})
      returning id`
    const [inv] =
      await sql`insert into booking_invitations (booking_id, worker_id, distance_km, expires_at)
      values (${b.id}, ${opts.workerId}, 2.5, now() + interval '1 hour') returning id`
    return { bookingId: b.id as string, invitationId: inv.id as string }
  }

  async function offer(opts: {
    bookingId: string
    invitationId: string
    workerId: string
    by?: 'CUSTOMER' | 'WORKER'
    amountPaise?: number
    status?: string
    round?: number
  }) {
    const [o] =
      await sql`insert into price_offers (booking_id, invitation_id, worker_id, offered_by, amount_paise, status, round, expires_at)
      values (${opts.bookingId}, ${opts.invitationId}, ${opts.workerId}, ${opts.by ?? 'CUSTOMER'},
        ${opts.amountPaise ?? 50000}, ${opts.status ?? 'PENDING'}, ${opts.round ?? 1}, now() + interval '1 hour')
      returning id`
    return o.id as string
  }

  /** Accepts an offer and confirms the booking for a slot starting at `start`. */
  async function confirm(opts: {
    bookingId: string
    invitationId: string
    workerId: string
    start: Date
    minutes?: number
    amountPaise?: number
  }) {
    const offerId = await offer({ ...opts, amountPaise: opts.amountPaise ?? 50000 })
    await sql`update price_offers set status = 'ACCEPTED', responded_at = now() where id = ${offerId}`
    await sql`update bookings set status = 'CONFIRMED', worker_id = ${opts.workerId}, agreed_price_paise = ${opts.amountPaise ?? 50000},
        accepted_offer_id = ${offerId}, slot = ${range(opts.start, opts.minutes ?? 60)}::tstzrange, confirmed_at = now()
      where id = ${opts.bookingId}`
    return offerId
  }

  /** A full world: category + service + customer + skilled worker + REQUESTED booking. */
  async function world() {
    const cat = await category()
    const customerId = await customer()
    const w = await worker(cat.categoryId)
    const b = await booking({ customerId, ...cat, workerId: w.workerId })
    return { ...cat, customerId, ...w, ...b }
  }

  return { category, customer, worker, booking, offer, confirm, world }
}
