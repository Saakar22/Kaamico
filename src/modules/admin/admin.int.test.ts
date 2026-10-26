import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as sweepRoute } from '@/app/api/internal/sweep/route'
import * as auditLogsRoute from '@/app/api/v1/admin/audit-logs/route'
import { POST as cancelRoute } from '@/app/api/v1/admin/bookings/[id]/cancel/route'
import { GET as bookingRoute } from '@/app/api/v1/admin/bookings/[id]/route'
import { GET as bookingsRoute } from '@/app/api/v1/admin/bookings/route'
import { PATCH as categoryPatchRoute } from '@/app/api/v1/admin/categories/[id]/route'
import {
  GET as catalogRoute,
  POST as categoryCreateRoute,
} from '@/app/api/v1/admin/categories/route'
import { GET as metricsRoute } from '@/app/api/v1/admin/metrics/route'
import { PATCH as servicePatchRoute } from '@/app/api/v1/admin/services/[id]/route'
import { POST as serviceCreateRoute } from '@/app/api/v1/admin/services/route'
import { PATCH as userStatusRoute } from '@/app/api/v1/admin/users/[id]/status/route'
import { GET as usersRoute } from '@/app/api/v1/admin/users/route'
import { GET as documentUrlRoute } from '@/app/api/v1/admin/verification-documents/[id]/url/route'
import { POST as decisionRoute } from '@/app/api/v1/admin/verifications/[id]/decision/route'
import { GET as applicationRoute } from '@/app/api/v1/admin/verifications/[id]/route'
import { GET as queueRoute } from '@/app/api/v1/admin/verifications/route'
import { GET as meRoute } from '@/app/api/v1/me/route'
import { getStorage } from '@/lib/storage'
import { createBooking } from '@/modules/bookings/create'
import { acceptOffer } from '@/modules/negotiation/offers'
import { listCategories } from '@/modules/catalog/catalog'
import { dispatchOutbox } from '@/modules/notifications/dispatcher'
import { getVerification } from '@/modules/verification/verification'
import { call, json, req, userWithSession, withId } from '@/test/api'
import { bookingWorld } from '@/test/booking-world'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'

const DAY = 86_400_000

describe.skipIf(!hasTestDatabase)('admin console', () => {
  const sql = connectTestDb()
  let admin: Awaited<ReturnType<typeof userWithSession>>
  let world: Awaited<ReturnType<typeof bookingWorld>>

  beforeEach(async () => {
    await truncateAll(sql)
    admin = await userWithSession(sql, { role: 'ADMIN', name: 'Asha Admin' })
    world = await bookingWorld(sql)
  })
  afterAll(async () => {
    await sql`drop trigger if exists fail_audit on admin_audit_logs`
    await sql.end()
  })

  const as = (cookie: string, path = '/', body?: unknown, method?: string) =>
    req(path, { cookie, body, method })
  const audits = () =>
    sql`select action, entity_type, entity_id, reason, admin_user_id from admin_audit_logs order by id`

  /** A professional with a submitted application, an ID document and a selfie on disk. */
  async function pendingApplication(submittedDaysAgo = 1) {
    const w = await userWithSession(sql, { role: 'WORKER', name: 'Sunil Kale' })
    await sql`update worker_profiles set verification_status = 'PENDING' where id = ${w.workerId}`
    const [app] = await sql`insert into verification_applications (worker_id, status, submitted_at)
      values (${w.workerId}, 'SUBMITTED', now() - ${submittedDaysAgo} * interval '1 day') returning id`
    const docs: string[] = []
    for (const docType of ['AADHAAR_MASKED', 'SELFIE']) {
      const key = `test/${randomUUID()}/doc`
      await getStorage().put(key, new Uint8Array([1, 2, 3]))
      const [d] = await sql`insert into verification_documents
        (application_id, doc_type, id_last4, storage_key, mime_type, size_bytes, sha256)
        values (${app.id}, ${docType}, ${docType === 'SELFIE' ? null : '1234'}, ${key}, 'image/jpeg', 3, ${'0'.repeat(64)})
        returning id`
      docs.push(d.id)
    }
    return { ...w, applicationId: app.id as string, docs }
  }

  const decide = (cookie: string, id: string, body: Record<string, unknown>) =>
    call(decisionRoute, as(cookie, '/', body), withId(id))
  const version = async (table: 'bookings' | 'verification_applications', id: string) =>
    (await sql`select version from ${sql(table)} where id = ${id}`)[0].version as number

  it('lets only admin sessions in', async () => {
    const customer = await userWithSession(sql, { role: 'CUSTOMER' })
    const reads = [
      metricsRoute,
      queueRoute,
      bookingsRoute,
      usersRoute,
      catalogRoute,
      auditLogsRoute.GET,
    ]
    for (const handler of reads) {
      expect((await call(handler, req('/'))).status).toBe(401)
      expect((await call(handler, as(customer.cookie))).status).toBe(403)
      expect((await call(handler, as(admin.cookie))).status).toBe(200)
    }
    // An admin who signed in through the customer OTP flow gets no admin powers.
    await sql`update users set roles = '{CUSTOMER,ADMIN}' where id = ${customer.userId}`
    expect((await call(metricsRoute, as(customer.cookie))).status).toBe(403)
    // The audit log is read-only: no handlers to write, change or delete it.
    expect(Object.keys(auditLogsRoute)).toEqual(['GET'])
  })

  describe('verification review', () => {
    it('queues pending applications oldest first and shows the detail with its audit trail', async () => {
      const newer = await pendingApplication(1)
      const older = await pendingApplication(3)
      const queue = await json(await call(queueRoute, as(admin.cookie, '/?tab=pending')))
      expect(queue.items.map((i: { id: string }) => i.id)).toEqual([
        older.applicationId,
        newer.applicationId,
      ])
      expect(queue.items[0]).toMatchObject({ workerName: 'Sunil Kale', documentCount: 2 })

      await call(documentUrlRoute, as(admin.cookie), withId(older.docs[0]))
      const detail = (
        await json(await call(applicationRoute, as(admin.cookie), withId(older.applicationId)))
      ).application
      expect(detail).toMatchObject({ status: 'SUBMITTED', decidable: true, version: 1 })
      expect(detail.documents.map((d: { docType: string }) => d.docType)).toEqual([
        'AADHAAR_MASKED',
        'SELFIE',
      ])
      expect(JSON.stringify(detail)).not.toMatch(/storageKey|storage_key|test\//)
      expect(detail.trail).toEqual([
        expect.objectContaining({ action: 'DOCUMENT_VIEWED', adminName: 'Asha Admin' }),
      ])
    })

    it('rejects with a reason in one audited transaction and tells the professional', async () => {
      const w = await pendingApplication()
      const short = await decide(admin.cookie, w.applicationId, {
        decision: 'REJECT',
        reason: 'Blurry',
        expectedVersion: 1,
      })
      expect(short.status).toBe(400)

      const reason = 'The selfie is too dark to compare with the ID photo.'
      const res = await decide(admin.cookie, w.applicationId, {
        decision: 'REJECT',
        reason,
        expectedVersion: 1,
      })
      expect(res.status).toBe(200)
      const [app] =
        await sql`select status, reviewer_admin_id, decision_reason from verification_applications`
      expect(app).toEqual({
        status: 'REJECTED',
        reviewer_admin_id: admin.userId,
        decision_reason: reason,
      })
      expect(
        (await sql`select verification_status from worker_profiles where id = ${w.workerId}`)[0],
      ).toEqual({
        verification_status: 'REJECTED',
      })
      const purge = await sql`select purge_after from verification_documents`
      for (const d of purge) {
        expect(new Date(d.purge_after).getTime()).toBeGreaterThan(Date.now() + 89 * DAY)
      }
      expect(await audits()).toEqual([
        {
          action: 'VERIFICATION_REJECTED',
          entity_type: 'verification_application',
          entity_id: w.applicationId,
          reason,
          admin_user_id: admin.userId,
        },
      ])

      await dispatchOutbox()
      expect(
        await sql`select title, body, link from notifications where user_id = ${w.userId}`,
      ).toEqual([
        {
          title: 'Your ID verification was not approved',
          body: reason,
          link: '/worker/verification',
        },
      ])
      const again = await decide(admin.cookie, w.applicationId, {
        decision: 'APPROVE',
        expectedVersion: 2,
      })
      expect(again.status).toBe(409)
      expect((await json(again)).error.code).toBe('ALREADY_DECIDED')
    })

    it('approves, asks for resubmission, and refuses stale decisions', async () => {
      const a = await pendingApplication()
      expect(
        (await decide(admin.cookie, a.applicationId, { decision: 'APPROVE', expectedVersion: 7 }))
          .status,
      ).toBe(409)
      expect(
        (await decide(admin.cookie, a.applicationId, { decision: 'APPROVE', expectedVersion: 1 }))
          .status,
      ).toBe(200)
      expect((await getVerification(a.workerId!)).workerStatus).toBe('VERIFIED')

      const b = await pendingApplication()
      await decide(admin.cookie, b.applicationId, {
        decision: 'REQUEST_RESUBMISSION',
        reason: 'Please upload the back of your Aadhaar as well.',
        expectedVersion: 1,
      })
      const state = await getVerification(b.workerId!)
      expect(state).toMatchObject({
        workerStatus: 'UNVERIFIED',
        canEdit: true,
        application: { status: 'RESUBMISSION_REQUESTED' },
      })
      // Files stay while the professional fixes the application.
      expect(
        await sql`select purge_after from verification_documents where application_id = ${b.applicationId}`,
      ).toEqual([{ purge_after: null }, { purge_after: null }])
    })

    it('rolls the decision back when the audit row cannot be written', async () => {
      const w = await pendingApplication()
      await sql`create or replace function kaamico_test_fail() returns trigger language plpgsql
        as $$ begin raise exception 'audit unavailable'; end $$`
      await sql`create trigger fail_audit before insert on admin_audit_logs
        for each row execute function kaamico_test_fail()`
      try {
        const res = await decide(admin.cookie, w.applicationId, {
          decision: 'APPROVE',
          expectedVersion: 1,
        })
        expect(res.status).toBe(500)
      } finally {
        await sql`drop trigger if exists fail_audit on admin_audit_logs`
      }
      expect((await sql`select status from verification_applications`)[0].status).toBe('SUBMITTED')
      expect(
        (await sql`select verification_status from worker_profiles where id = ${w.workerId}`)[0],
      ).toEqual({
        verification_status: 'PENDING',
      })
      expect(await sql`select topic from outbox_events`).toEqual([])
    })

    it('purges identity files after the retention date and keeps the metadata', async () => {
      const w = await pendingApplication()
      const [doc] =
        await sql`select storage_key from verification_documents where id = ${w.docs[0]}`
      await sql`update verification_documents set purge_after = now() - interval '1 minute' where id = ${w.docs[0]}`
      const res = await call(
        sweepRoute,
        req('/api/internal/sweep', {
          body: {},
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        }),
      )
      expect((await json(res)).documents).toEqual({ purged: 1 })
      expect(await getStorage().get(doc.storage_key)).toBeNull()
      const rows =
        await sql`select id, purged_at is not null as purged from verification_documents order by uploaded_at`
      expect(rows.find((r) => r.id === w.docs[0])?.purged).toBe(true)
      expect(rows.find((r) => r.id === w.docs[1])?.purged).toBe(false)
      const link = await call(documentUrlRoute, as(admin.cookie), withId(w.docs[0]))
      expect((await json(link)).error.code).toBe('EXPIRED')
    })
  })

  describe('bookings', () => {
    async function confirmedBooking() {
      const w = await world.worker()
      const c = await world.customer()
      const { bookingId } = await createBooking(c.actor, world.request(c, w), world.key())
      const [offer] = await sql`select id from price_offers where booking_id = ${bookingId}`
      await acceptOffer(w.actor, offer.id, {
        expectedBookingVersion: await version('bookings', bookingId),
      })
      return { w, c, bookingId }
    }

    it('filters the table and shows the whole booking', async () => {
      const { c, bookingId } = await confirmedBooking()
      const [{ code }] = await sql`select code from bookings where id = ${bookingId}`
      await sql`insert into negotiation_messages (booking_id, worker_id, sender_user_id, body)
        select id, worker_id, customer_id, 'Gate code is 4411' from bookings where id = ${bookingId}`

      const byCode = await json(await call(bookingsRoute, as(admin.cookie, `/?q=${code.slice(4)}`)))
      expect(byCode.items.map((b: { id: string }) => b.id)).toEqual([bookingId])
      const byStatus = await json(await call(bookingsRoute, as(admin.cookie, '/?status=COMPLETED')))
      expect(byStatus.items).toEqual([])
      expect((await call(bookingsRoute, as(admin.cookie, '/?from=yesterday'))).status).toBe(400)

      const detail = (await json(await call(bookingRoute, as(admin.cookie), withId(bookingId))))
        .booking
      expect(detail).toMatchObject({
        status: 'CONFIRMED',
        cancellable: true,
        customer: { id: c.userId, name: 'Priya Sharma' },
        worker: { name: 'Rakesh Patil', assigned: true },
      })
      expect(detail.customer.phone).toMatch(/^\+91/)
      expect(detail.offers).toHaveLength(1)
      expect(detail.messages).toEqual([
        expect.objectContaining({ from: 'CUSTOMER', body: 'Gate code is 4411' }),
      ])
      expect(detail.history.map((h: { to: string }) => h.to)).toEqual(['REQUESTED', 'CONFIRMED'])
    })

    it('cancels with a reason, tells both sides and records it', async () => {
      const { w, c, bookingId } = await confirmedBooking()
      const v = await version('bookings', bookingId)
      expect(
        (
          await call(
            cancelRoute,
            as(admin.cookie, '/', { reason: 'Dup', expectedVersion: v }),
            withId(bookingId),
          )
        ).status,
      ).toBe(400)
      const reason = 'Customer called support: duplicate booking'
      const res = await call(
        cancelRoute,
        as(admin.cookie, '/', { reason, expectedVersion: v }),
        withId(bookingId),
      )
      expect(res.status).toBe(200)
      expect(
        (await sql`select status, cancelled_by, cancellation_reason from bookings`)[0],
      ).toEqual({
        status: 'CANCELLED',
        cancelled_by: 'ADMIN',
        cancellation_reason: reason,
      })
      expect((await audits()).map((a) => [a.action, a.entity_id, a.reason])).toEqual([
        ['BOOKING_CANCELLED', bookingId, reason],
      ])
      await dispatchOutbox()
      const told =
        await sql`select user_id from notifications where type = 'booking.cancelled' order by user_id`
      expect(told.map((n) => n.user_id).sort()).toEqual([c.userId, w.userId].sort())

      const again = await call(
        cancelRoute,
        as(admin.cookie, '/', { reason, expectedVersion: v + 1 }),
        withId(bookingId),
      )
      expect((await json(again)).error.code).toBe('INVALID_TRANSITION')
    })
  })

  describe('users', () => {
    it('suspends a professional: signed out, offline, open requests cancelled; then reactivates', async () => {
      const w = await world.worker()
      const c = await world.customer()
      const { bookingId } = await createBooking(c.actor, world.request(c, w), world.key())
      const [{ phone }] = await sql`select phone from users where id = ${w.userId}`

      const found = await json(
        await call(usersRoute, as(admin.cookie, `/?q=${phone.slice(-6)}&role=WORKER`)),
      )
      expect(found.items).toEqual([expect.objectContaining({ id: w.userId, status: 'ACTIVE' })])

      const reason = 'Several customers reported rude behaviour'
      const res = await call(
        userStatusRoute,
        as(admin.cookie, '/', { status: 'SUSPENDED', reason }, 'PATCH'),
        withId(w.userId),
      )
      expect(await json(res)).toEqual({
        userId: w.userId,
        status: 'SUSPENDED',
        cancelledRequests: 1,
      })
      expect((await call(meRoute, req('/', { cookie: w.cookie }))).status).toBe(401)
      expect(
        (await sql`select is_online from worker_profiles where id = ${w.workerId}`)[0].is_online,
      ).toBe(false)
      expect(
        (await sql`select status, cancelled_by from bookings where id = ${bookingId}`)[0],
      ).toEqual({
        status: 'CANCELLED',
        cancelled_by: 'ADMIN',
      })
      expect((await audits()).map((a) => a.action)).toEqual(['USER_SUSPENDED'])

      const twice = await call(
        userStatusRoute,
        as(admin.cookie, '/', { status: 'SUSPENDED', reason }, 'PATCH'),
        withId(w.userId),
      )
      expect((await json(twice)).error.code).toBe('NO_CHANGE')
      await call(
        userStatusRoute,
        as(
          admin.cookie,
          '/',
          { status: 'ACTIVE', reason: 'Appeal reviewed and accepted' },
          'PATCH',
        ),
        withId(w.userId),
      )
      expect((await sql`select status from users where id = ${w.userId}`)[0].status).toBe('ACTIVE')
    })

    it('does not change admin accounts', async () => {
      const other = await userWithSession(sql, { role: 'ADMIN' })
      const res = await call(
        userStatusRoute,
        as(admin.cookie, '/', { status: 'SUSPENDED', reason: 'Testing the guard rail' }, 'PATCH'),
        withId(other.userId),
      )
      expect(res.status).toBe(403)
      expect(await audits()).toEqual([])
    })
  })

  describe('catalog', () => {
    it('creates and edits categories and services, audited, and hides deactivated ones', async () => {
      const created = await call(
        categoryCreateRoute,
        as(admin.cookie, '/', {
          slug: 'pest-control',
          name: 'Pest control',
          description: 'Cockroaches, termites and more',
          iconKey: 'bug',
          sortOrder: 5,
        }),
      )
      expect(created.status).toBe(201)
      const { category } = await json(created)
      const clash = await call(
        categoryCreateRoute,
        as(admin.cookie, '/', { slug: 'pest-control', name: 'Again', iconKey: 'bug' }),
      )
      expect(clash.status).toBe(409)
      expect((await json(clash)).error.details.issues).toEqual([
        { path: 'slug', message: 'That slug is already used' },
      ])

      const badRange = await call(
        serviceCreateRoute,
        as(admin.cookie, '/', {
          categoryId: category.id,
          slug: 'cockroach-treatment',
          name: 'Cockroach treatment',
          pricingUnit: 'PER_VISIT',
          typicalDurationMin: 90,
          referenceMinPaise: 150000,
          referenceMaxPaise: 100000,
        }),
      )
      expect(badRange.status).toBe(400)
      const svc = await json(
        await call(
          serviceCreateRoute,
          as(admin.cookie, '/', {
            categoryId: category.id,
            slug: 'cockroach-treatment',
            name: 'Cockroach treatment',
            pricingUnit: 'PER_VISIT',
            typicalDurationMin: 90,
            referenceMinPaise: 100000,
            referenceMaxPaise: 150000,
            searchTerms: 'cockroach kida',
          }),
        ),
      )
      expect(svc.service).not.toHaveProperty('searchVector')
      expect((await listCategories()).map((c) => c.slug)).toContain('pest-control')

      await call(
        servicePatchRoute,
        as(admin.cookie, '/', { isActive: false }, 'PATCH'),
        withId(svc.service.id),
      )
      await call(
        categoryPatchRoute,
        as(admin.cookie, '/', { isActive: false }, 'PATCH'),
        withId(category.id),
      )
      expect((await listCategories()).map((c) => c.slug)).not.toContain('pest-control')
      // A no-op edit writes nothing.
      await call(
        categoryPatchRoute,
        as(admin.cookie, '/', { isActive: false }, 'PATCH'),
        withId(category.id),
      )

      expect((await audits()).map((a) => a.action)).toEqual([
        'CATEGORY_CREATED',
        'SERVICE_CREATED',
        'SERVICE_UPDATED',
        'CATEGORY_UPDATED',
      ])
      const [update] =
        await sql`select before, after from admin_audit_logs where action = 'CATEGORY_UPDATED'`
      expect(update).toEqual({ before: { isActive: true }, after: { isActive: false } })
      // Fields the patch did not mention are untouched.
      expect(
        (
          await sql`select sort_order, description from service_categories where id = ${category.id}`
        )[0],
      ).toEqual({ sort_order: 5, description: 'Cockroaches, termites and more' })
      const admin2 = await json(await call(catalogRoute, as(admin.cookie)))
      expect(admin2.categories.find((c: { id: string }) => c.id === category.id)).toMatchObject({
        isActive: false,
        services: [expect.objectContaining({ isActive: false })],
      })
    })
  })

  it('reports metrics and filters the audit log', async () => {
    await pendingApplication(2)
    const w = await world.worker()
    const c = await world.customer()
    await createBooking(c.actor, world.request(c, w), world.key())
    const metrics = await json(await call(metricsRoute, as(admin.cookie)))
    expect(metrics).toMatchObject({
      pendingVerifications: 1,
      openRequests: 1,
      activeJobs: 0,
      bookingsToday: 1,
      bookings7d: 1,
      medianResponseMinutes: null,
    })
    expect(new Date(metrics.oldestPendingAt).getTime()).toBeLessThan(Date.now() - DAY)

    const p = await pendingApplication()
    await call(documentUrlRoute, as(admin.cookie), withId(p.docs[1]))
    await decide(admin.cookie, p.applicationId, { decision: 'APPROVE', expectedVersion: 1 })
    const all = await json(await call(auditLogsRoute.GET, as(admin.cookie)))
    expect(all.logs.map((l: { action: string }) => l.action)).toEqual([
      'VERIFICATION_APPROVED',
      'DOCUMENT_VIEWED',
    ])
    const views = await json(
      await call(auditLogsRoute.GET, as(admin.cookie, '/?action=DOCUMENT_VIEWED')),
    )
    expect(views.logs).toEqual([
      expect.objectContaining({ entityId: p.docs[1], adminName: 'Asha Admin', ip: '203.0.113.9' }),
    ])
  })
})
