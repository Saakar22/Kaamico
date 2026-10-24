import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { connectTestDb, fixtures, hasTestDatabase, PG, truncateAll } from '@/test/db'

// These tests prove the database itself enforces the rules in IMPLEMENTATION_PLAN.md §9.4,
// independent of application code.
describe.skipIf(!hasTestDatabase)('database integrity rules', () => {
  const sql = connectTestDb()
  const f = fixtures(sql)
  const rejects = (p: Promise<unknown>, code: string) => expect(p).rejects.toMatchObject({ code })

  beforeEach(async () => {
    await truncateAll(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  describe('double booking', () => {
    it('rejects overlapping active slots for the same worker', async () => {
      const w = await f.world()
      const start = new Date('2030-01-01T05:00:00Z')
      await f.confirm({ ...w, start, minutes: 90 })

      const other = await f.booking({ ...w })
      await rejects(
        f.confirm({ ...w, ...other, start: new Date('2030-01-01T06:00:00Z') }),
        PG.exclusionViolation,
      )
    })

    it('allows back-to-back slots and overlaps with finished bookings', async () => {
      const w = await f.world()
      await f.confirm({ ...w, start: new Date('2030-01-01T05:00:00Z'), minutes: 60 })

      const next = await f.booking({ ...w })
      await f.confirm({ ...w, ...next, start: new Date('2030-01-01T06:00:00Z'), minutes: 60 })

      // Once the first booking is completed its slot no longer blocks the worker.
      await sql`update bookings set status = 'COMPLETED', completed_at = now() where id = ${w.bookingId}`
      const overlapping = await f.booking({ ...w })
      await f.confirm({
        ...w,
        ...overlapping,
        start: new Date('2030-01-01T05:15:00Z'),
        minutes: 30,
      })
    })

    it('lets exactly one of many concurrent confirmations win, even without app locking', async () => {
      const w = await f.world()
      const contenders = await Promise.all(Array.from({ length: 8 }, () => f.booking({ ...w })))
      const start = new Date('2030-02-01T05:00:00Z')
      const results = await Promise.allSettled(
        contenders.map((b) => f.confirm({ ...w, ...b, start, minutes: 60 })),
      )
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      // Unserialised exclusion checks may also deadlock (40P01); either way nothing is double-booked.
      for (const r of results.filter((r) => r.status === 'rejected')) {
        expect([PG.exclusionViolation, PG.deadlockDetected]).toContain(
          ((r as PromiseRejectedResult).reason as { code: string }).code,
        )
      }
      const [active] = await sql`select count(*)::int as n from bookings where status = 'CONFIRMED'`
      expect(active.n).toBe(1)
    })

    it('gives clean conflicts when confirmations lock the worker row first (the planned accept flow)', async () => {
      const w = await f.world()
      const contenders = await Promise.all(Array.from({ length: 8 }, () => f.booking({ ...w })))
      const start = new Date('2030-03-01T05:00:00Z')
      const results = await Promise.allSettled(
        contenders.map((b) =>
          sql.begin(async (tx) => {
            await tx`select id from worker_profiles where id = ${w.workerId} for update`
            await fixtures(tx).confirm({ ...w, ...b, start, minutes: 60 })
          }),
        ),
      )
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      for (const r of results.filter((r) => r.status === 'rejected')) {
        expect((r as PromiseRejectedResult).reason).toMatchObject({ code: PG.exclusionViolation })
      }
    })
  })

  describe('price locking', () => {
    it('locks the agreed price, accepted offer and worker once confirmed', async () => {
      const w = await f.world()
      await f.confirm({ ...w, start: new Date('2030-01-01T05:00:00Z') })
      await rejects(
        sql`update bookings set agreed_price_paise = 99900 where id = ${w.bookingId}`,
        PG.restrictViolation,
      )
      await rejects(
        sql`update bookings set accepted_offer_id = null where id = ${w.bookingId}`,
        PG.restrictViolation,
      )
      const other = await f.worker(w.categoryId)
      await rejects(
        sql`update bookings set worker_id = ${other.workerId} where id = ${w.bookingId}`,
        PG.restrictViolation,
      )
      await rejects(
        sql`update bookings set commission_bps = 0 where id = ${w.bookingId}`,
        PG.restrictViolation,
      )
    })

    it('never lets a booking change customer or service', async () => {
      const w = await f.world()
      const someoneElse = await f.customer()
      await rejects(
        sql`update bookings set customer_id = ${someoneElse} where id = ${w.bookingId}`,
        PG.restrictViolation,
      )
    })

    it('requires price, worker, offer and slot when a booking is confirmed', async () => {
      const w = await f.world()
      await rejects(
        sql`update bookings set status = 'CONFIRMED' where id = ${w.bookingId}`,
        PG.checkViolation,
      )
    })

    it('includes only approved extra charges in the final amount', async () => {
      const w = await f.world()
      await f.confirm({ ...w, start: new Date('2030-01-01T05:00:00Z'), amountPaise: 60000 })
      await sql`update bookings set approved_charges_paise = 15000 where id = ${w.bookingId}`
      const [b] = await sql`select final_amount_paise from bookings where id = ${w.bookingId}`
      expect(b.final_amount_paise).toBe(75000)
    })

    it('forbids deleting bookings', async () => {
      const w = await f.world()
      await sql`delete from booking_invitations where booking_id = ${w.bookingId}`
      await rejects(sql`delete from bookings where id = ${w.bookingId}`, PG.restrictViolation)
    })
  })

  describe('negotiation history', () => {
    it('allows one pending offer per thread', async () => {
      const w = await f.world()
      await f.offer({ ...w })
      await rejects(f.offer({ ...w, by: 'WORKER', round: 2 }), PG.uniqueViolation)
    })

    it('allows one accepted offer per booking', async () => {
      const w = await f.world()
      await f.offer({ ...w, status: 'ACCEPTED' })
      await rejects(f.offer({ ...w, status: 'ACCEPTED', round: 2 }), PG.uniqueViolation)
    })

    it('keeps offer terms immutable and statuses final', async () => {
      const w = await f.world()
      const offerId = await f.offer({ ...w })
      await rejects(
        sql`update price_offers set amount_paise = 1 where id = ${offerId}`,
        PG.restrictViolation,
      )
      await sql`update price_offers set status = 'COUNTERED' where id = ${offerId}`
      await rejects(
        sql`update price_offers set status = 'ACCEPTED' where id = ${offerId}`,
        PG.restrictViolation,
      )
      await rejects(sql`delete from price_offers where id = ${offerId}`, PG.restrictViolation)
    })
  })

  describe('append-only records', () => {
    it('blocks edits and deletes on history, messages, ledger, audit log and invoices', async () => {
      const w = await f.world()
      const [h] = await sql`insert into booking_status_history (booking_id, to_status, actor_role)
        values (${w.bookingId}, 'REQUESTED', 'SYSTEM') returning id`
      await rejects(
        sql`update booking_status_history set reason = 'x' where id = ${h.id}`,
        PG.restrictViolation,
      )
      await rejects(
        sql`delete from booking_status_history where id = ${h.id}`,
        PG.restrictViolation,
      )

      const [m] =
        await sql`insert into negotiation_messages (booking_id, worker_id, sender_user_id, body)
        values (${w.bookingId}, ${w.workerId}, ${w.customerId}, 'hello') returning id`
      await rejects(
        sql`update negotiation_messages set body = 'edited' where id = ${m.id}`,
        PG.restrictViolation,
      )

      const [l] =
        await sql`insert into worker_ledger_entries (worker_id, type, amount_paise, description)
        values (${w.workerId}, 'ADJUSTMENT', 500, 'test') returning id`
      await rejects(
        sql`update worker_ledger_entries set amount_paise = 5000 where id = ${l.id}`,
        PG.restrictViolation,
      )

      const [a] =
        await sql`insert into admin_audit_logs (admin_user_id, action, entity_type, entity_id)
        values (${w.customerId}, 'TEST', 'booking', ${w.bookingId}) returning id`
      await rejects(sql`delete from admin_audit_logs where id = ${a.id}`, PG.restrictViolation)

      const [i] =
        await sql`insert into invoices (booking_id, number, line_items, subtotal_paise, platform_fee_paise, total_paise)
        values (${w.bookingId}, 'KMC/TEST/1', '[]', 1000, 100, 1000) returning id`
      await rejects(
        sql`update invoices set total_paise = 1 where id = ${i.id}`,
        PG.restrictViolation,
      )
    })

    it('posts a booking’s earning only once and enforces entry signs', async () => {
      const w = await f.world()
      const earn = sql`insert into worker_ledger_entries (worker_id, booking_id, type, amount_paise, description)
        values (${w.workerId}, ${w.bookingId}, 'JOB_EARNING', 50000, 'job')`
      await earn
      await rejects(
        sql`insert into worker_ledger_entries (worker_id, booking_id, type, amount_paise, description)
          values (${w.workerId}, ${w.bookingId}, 'JOB_EARNING', 50000, 'job again')`,
        PG.uniqueViolation,
      )
      await rejects(
        sql`insert into worker_ledger_entries (worker_id, booking_id, type, amount_paise, description)
          values (${w.workerId}, ${w.bookingId}, 'COMMISSION', 5000, 'positive commission')`,
        PG.checkViolation,
      )
    })
  })

  describe('reviews', () => {
    async function completedWorld() {
      const w = await f.world()
      await f.confirm({ ...w, start: new Date('2030-01-01T05:00:00Z') })
      await sql`update bookings set status = 'COMPLETED', completed_at = now() where id = ${w.bookingId}`
      return w
    }
    const review = (
      w: { bookingId: string; customerId: string; workerId: string },
      createdAt?: Date,
    ) =>
      sql`insert into reviews (booking_id, customer_id, worker_id, rating, created_at)
        values (${w.bookingId}, ${w.customerId}, ${w.workerId}, 5, ${createdAt ?? new Date()})`

    it('accepts one review from the customer of a completed booking', async () => {
      const w = await completedWorld()
      await review(w)
      await rejects(review(w), PG.uniqueViolation)
    })

    it('rejects reviews of bookings that are not completed', async () => {
      const w = await f.world()
      await rejects(review(w), PG.checkViolation)
    })

    it('rejects reviews by anyone other than the booking customer', async () => {
      const w = await completedWorld()
      const stranger = await f.customer()
      await rejects(review({ ...w, customerId: stranger }), PG.checkViolation)
    })

    it('closes the review window after 14 days', async () => {
      const w = await completedWorld()
      await rejects(review(w, new Date(Date.now() + 15 * 86_400_000)), PG.checkViolation)
    })

    it('limits ratings to 1–5', async () => {
      const w = await completedWorld()
      await rejects(
        sql`insert into reviews (booking_id, customer_id, worker_id, rating) values (${w.bookingId}, ${w.customerId}, ${w.workerId}, 6)`,
        PG.checkViolation,
      )
    })
  })

  describe('eligibility and money', () => {
    it('lets workers price only services in their skill categories', async () => {
      const skilled = await f.category()
      const unskilled = await f.category()
      const w = await f.worker(skilled.categoryId)
      await sql`insert into worker_service_pricing (worker_id, service_id, price_paise, min_charge_paise, unit)
        values (${w.workerId}, ${skilled.serviceId}, 40000, 30000, 'PER_ITEM')`
      await rejects(
        sql`insert into worker_service_pricing (worker_id, service_id, price_paise, min_charge_paise, unit)
          values (${w.workerId}, ${unskilled.serviceId}, 40000, 30000, 'PER_ITEM')`,
        PG.checkViolation,
      )
    })

    it('enforces the ₹50 – ₹1,00,000 price range', async () => {
      const cat = await f.category()
      const w = await f.worker(cat.categoryId)
      await rejects(
        sql`insert into worker_service_pricing (worker_id, service_id, price_paise, min_charge_paise, unit)
          values (${w.workerId}, ${cat.serviceId}, 4999, 0, 'PER_ITEM')`,
        PG.checkViolation,
      )
    })

    it('caps refunds at the payment amount', async () => {
      const w = await f.world()
      const [p] =
        await sql`insert into payments (booking_id, payer_user_id, provider, amount_paise, idempotency_key)
        values (${w.bookingId}, ${w.customerId}, 'SIMULATED', 50000, ${randomUUID()}) returning id`
      const refund = (amount: number) =>
        sql`insert into refunds (payment_id, amount_paise, reason, initiated_by_admin_id)
          values (${p.id}, ${amount}, 'test', ${w.customerId})`
      await refund(30000)
      await rejects(refund(20001), PG.checkViolation)
      await refund(20000)
    })

    it('deduplicates booking creation per customer idempotency key', async () => {
      const w = await f.world()
      const [b] = await sql`select idempotency_key from bookings where id = ${w.bookingId}`
      await rejects(
        sql`insert into bookings (code, customer_id, service_id, category_id, timing, requested_start, address_snapshot,
            job_lat, job_lng, locality_label, commission_bps, idempotency_key)
          values ('T-dup', ${w.customerId}, ${w.serviceId}, ${w.categoryId}, 'SCHEDULED', now(), '{}', 18.5, 73.8, 'x', 1000,
            ${b.idempotency_key})`,
        PG.uniqueViolation,
      )
    })

    it('prevents overlapping weekly availability windows', async () => {
      const cat = await f.category()
      const w = await f.worker(cat.categoryId)
      await sql`insert into worker_availability_rules (worker_id, weekday, start_minute, end_minute)
        values (${w.workerId}, 0, 540, 780)`
      await rejects(
        sql`insert into worker_availability_rules (worker_id, weekday, start_minute, end_minute)
          values (${w.workerId}, 0, 720, 900)`,
        PG.exclusionViolation,
      )
    })

    it('accepts only Indian mobile numbers', async () => {
      await rejects(sql`insert into users (phone) values ('+919')`, PG.checkViolation)
      await rejects(sql`insert into users (phone) values ('+15551234567')`, PG.checkViolation)
    })
  })

  describe('haversine distance', () => {
    it('matches known distances', async () => {
      // Kothrud → Viman Nagar, Pune: roughly 12 km in a straight line.
      const [r] = await sql`select kaamico_haversine_km(18.5074, 73.8077, 18.5679, 73.9143) as km`
      expect(r.km).toBeGreaterThan(12)
      expect(r.km).toBeLessThan(13.5)
    })
  })
})
