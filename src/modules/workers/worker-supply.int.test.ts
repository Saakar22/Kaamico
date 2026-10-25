import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as adminDocumentUrl } from '@/app/api/v1/admin/verification-documents/[id]/url/route'
import { GET as fileRoute } from '@/app/api/v1/files/[token]/route'
import { GET as publicPhotoRoute } from '@/app/api/v1/professionals/[id]/photo/route'
import { POST as uploadRoute } from '@/app/api/v1/uploads/route'
import {
  GET as getAvailability,
  PUT as putAvailability,
} from '@/app/api/v1/worker/availability/route'
import { GET as dashboardRoute } from '@/app/api/v1/worker/dashboard/route'
import { GET as getPricing, PUT as putPricing } from '@/app/api/v1/worker/pricing/route'
import { POST as presenceRoute } from '@/app/api/v1/worker/presence/route'
import { GET as ownPhotoRoute } from '@/app/api/v1/worker/profile/photo/route'
import { GET as getProfile, PATCH as patchProfile } from '@/app/api/v1/worker/profile/route'
import { PUT as putServiceArea } from '@/app/api/v1/worker/service-area/route'
import { PUT as putSkills } from '@/app/api/v1/worker/skills/route'
import { POST as statusRoute } from '@/app/api/v1/worker/status/route'
import { DELETE as deleteTimeOff } from '@/app/api/v1/worker/time-off/[id]/route'
import { POST as addTimeOff } from '@/app/api/v1/worker/time-off/route'
import { DELETE as deleteDocument } from '@/app/api/v1/worker/verification/documents/[id]/route'
import { POST as addDocument } from '@/app/api/v1/worker/verification/documents/route'
import { GET as verificationRoute } from '@/app/api/v1/worker/verification/route'
import { POST as submitRoute } from '@/app/api/v1/worker/verification/submit/route'
import { LocalStorage, setStorageForTests } from '@/lib/storage'
import { createFileToken } from '@/lib/storage/signed-url'
import { call, json, req, uploadForm, userWithSession, withId } from '@/test/api'
import { connectTestDb, fixtures, hasTestDatabase, truncateAll } from '@/test/db'
import {
  containsText,
  htmlPretendingToBeJpeg,
  jpegWithExif,
  SECRET_GPS,
  tinyPdf,
} from '@/test/files'

describe.skipIf(!hasTestDatabase)('worker supply: onboarding, uploads and verification', () => {
  const sql = connectTestDb()
  let storageDir: string
  let storage: LocalStorage
  let categoryId: string
  let otherCategoryId: string
  let serviceId: string
  let otherServiceId: string
  let kothrudId: string

  beforeAll(async () => {
    storageDir = await mkdtemp(path.join(tmpdir(), 'kaamico-uploads-'))
    storage = new LocalStorage(storageDir)
    setStorageForTests(storage)
  })
  afterAll(async () => {
    setStorageForTests(undefined)
    await rm(storageDir, { recursive: true, force: true })
    await sql.end()
  })

  beforeEach(async () => {
    await truncateAll(sql)
    const [c1] = await sql`insert into service_categories (slug, name, icon_key)
      values ('plumbing', 'Plumbing', 'wrench') returning id`
    const [c2] = await sql`insert into service_categories (slug, name, icon_key)
      values ('electrical', 'Electrical', 'zap') returning id`
    categoryId = c1.id
    otherCategoryId = c2.id
    const [s1] =
      await sql`insert into services (category_id, slug, name, pricing_unit, typical_duration_min)
      values (${categoryId}, 'tap-repair', 'Tap repair', 'PER_ITEM', 30) returning id`
    const [s2] =
      await sql`insert into services (category_id, slug, name, pricing_unit, typical_duration_min)
      values (${otherCategoryId}, 'fan', 'Fan installation', 'PER_ITEM', 45) returning id`
    serviceId = s1.id
    otherServiceId = s2.id
    const [l] = await sql`insert into localities (city, name, pincode, lat, lng)
      values ('Pune', 'Kothrud', '411038', 18.5074, 73.8077) returning id`
    kothrudId = l.id
  })

  const worker = () => userWithSession(sql, { role: 'WORKER', name: 'Imran Shaikh' })

  async function upload(
    cookie: string,
    bytes: Uint8Array,
    purpose: string,
    name?: string,
    type?: string,
  ) {
    return call(
      uploadRoute,
      req('/api/v1/uploads', { cookie, form: uploadForm(bytes, purpose, name, type) }),
    )
  }

  async function uploadId(cookie: string, bytes: Uint8Array, purpose = 'VERIFICATION_DOCUMENT') {
    const res = await upload(cookie, bytes, purpose)
    expect(res.status).toBe(201)
    return (await json(res)).uploadId as string
  }

  /** Profile, skills and area: what submission needs besides documents. */
  async function completeProfile(cookie: string) {
    const steps = [
      call(
        patchProfile,
        req('/api/v1/worker/profile', {
          method: 'PATCH',
          cookie,
          body: {
            displayName: 'Imran Shaikh',
            bio: 'Plumber with 6 years of experience.',
            yearsExperience: 6,
            languages: ['hi', 'mr'],
          },
        }),
      ),
      call(
        putSkills,
        req('/api/v1/worker/skills', {
          method: 'PUT',
          cookie,
          body: { categoryIds: [categoryId] },
        }),
      ),
      call(
        putServiceArea,
        req('/api/v1/worker/service-area', {
          method: 'PUT',
          cookie,
          body: { localityId: kothrudId, radiusKm: 6 },
        }),
      ),
    ]
    for (const res of await Promise.all(steps)) expect(res.status).toBe(200)
  }

  async function addDoc(cookie: string, body: Record<string, unknown>) {
    return call(addDocument, req('/api/v1/worker/verification/documents', { cookie, body }))
  }

  const submit = (cookie: string, key = randomUUID()) =>
    call(
      submitRoute,
      req('/api/v1/worker/verification/submit', { cookie, headers: { 'idempotency-key': key } }),
    )

  describe('upload security', () => {
    it('stores photos without EXIF location data, outside any public folder', async () => {
      const { cookie, userId } = await worker()
      const res = await upload(cookie, jpegWithExif(), 'VERIFICATION_DOCUMENT')
      expect(res.status).toBe(201)
      const body = await json(res)
      expect(body).toMatchObject({ mimeType: 'image/jpeg', purpose: 'VERIFICATION_DOCUMENT' })
      expect(JSON.stringify(body)).not.toMatch(/kyc\/|storage/i)

      const [row] =
        await sql`select storage_key, size_bytes from uploads where id = ${body.uploadId}`
      expect(row.storage_key).toMatch(new RegExp(`^kyc/${userId}/`))
      const stored = await storage.get(row.storage_key)
      expect(stored).not.toBeNull()
      expect(containsText(stored!, SECRET_GPS)).toBe(false)
      expect(stored!.length).toBe(row.size_bytes)
    })

    it('judges files by their content, not their name or claimed type', async () => {
      const { cookie } = await worker()
      const spoofed = await upload(
        cookie,
        htmlPretendingToBeJpeg(),
        'VERIFICATION_DOCUMENT',
        'id.jpg',
        'image/jpeg',
      )
      expect(spoofed.status).toBe(422)
      expect((await json(spoofed)).error.code).toBe('UNSUPPORTED_FILE_TYPE')

      // A PDF is fine as an ID document but not as a profile photo.
      expect(
        (await upload(cookie, tinyPdf(), 'VERIFICATION_DOCUMENT', 'id.pdf', 'application/pdf'))
          .status,
      ).toBe(201)
      expect(
        (await upload(cookie, tinyPdf(), 'PROFILE_PHOTO', 'me.jpg', 'image/jpeg')).status,
      ).toBe(422)
    })

    it('enforces size limits and rejects damaged images', async () => {
      const { cookie } = await worker()
      const huge = new Uint8Array(5 * 1024 * 1024 + 1)
      huge.set(jpegWithExif())
      const tooBig = await upload(cookie, huge, 'PROFILE_PHOTO')
      expect(tooBig.status).toBe(413)
      expect((await json(tooBig)).error.code).toBe('FILE_TOO_LARGE')

      const damaged = await upload(cookie, jpegWithExif().slice(0, 12), 'PROFILE_PHOTO')
      expect((await json(damaged)).error.code).toBe('INVALID_FILE')
      expect(await readdir(storageDir).catch(() => [])).not.toContain('photos')
    })

    it('limits uploads to 20 an hour and to professionals', async () => {
      const { cookie } = await worker()
      for (let i = 0; i < 20; i++)
        expect((await upload(cookie, tinyPdf(), 'VERIFICATION_DOCUMENT')).status).toBe(201)
      expect((await upload(cookie, tinyPdf(), 'VERIFICATION_DOCUMENT')).status).toBe(429)

      const customer = await userWithSession(sql, { role: 'CUSTOMER' })
      expect((await upload(customer.cookie, tinyPdf(), 'VERIFICATION_DOCUMENT')).status).toBe(403)
      expect((await upload('', tinyPdf(), 'VERIFICATION_DOCUMENT')).status).toBe(401)
    })
  })

  describe('verification', () => {
    it('takes a new professional from sign-up to SUBMITTED, idempotently', async () => {
      const { cookie, workerId } = await worker()
      await completeProfile(cookie)

      const early = await submit(cookie)
      expect(early.status).toBe(409) // no documents yet: nothing to submit

      const idDoc = await addDoc(cookie, {
        uploadId: await uploadId(cookie, jpegWithExif()),
        docType: 'AADHAAR_MASKED',
        idLast4: '4821',
      })
      expect(idDoc.status).toBe(201)
      const incomplete = await submit(cookie)
      expect(incomplete.status).toBe(422)
      expect((await json(incomplete)).error.details.missing).toEqual(['selfie'])

      expect(
        (
          await addDoc(cookie, {
            uploadId: await uploadId(cookie, jpegWithExif()),
            docType: 'SELFIE',
          })
        ).status,
      ).toBe(201)

      const key = randomUUID()
      const submitted = await submit(cookie, key)
      expect(submitted.status).toBe(200)
      const state = await json(submitted)
      expect(state.application).toMatchObject({ status: 'SUBMITTED', attempt: 1 })
      expect(state.workerStatus).toBe('PENDING')

      const replay = await submit(cookie, key)
      expect(replay.headers.get('idempotent-replayed')).toBe('true')
      expect(await json(replay)).toEqual(state)
      expect((await submit(cookie)).status).toBe(409)

      const [worker_] =
        await sql`select verification_status from worker_profiles where id = ${workerId}`
      expect(worker_.verification_status).toBe('PENDING')
      const events = await sql`select topic, payload from outbox_events`
      expect(events).toEqual([
        { topic: 'verification.submitted', payload: expect.objectContaining({ workerId }) },
      ])

      // Uploads are locked while under review.
      const locked = await addDoc(cookie, {
        uploadId: await uploadId(cookie, jpegWithExif()),
        docType: 'SKILL_CERTIFICATE',
      })
      expect((await json(locked)).error.code).toBe('UNDER_REVIEW')
    })

    it('validates documents: last 4 only for IDs, photos for selfies, at most 6, own uploads', async () => {
      const { cookie } = await worker()
      const missingLast4 = await addDoc(cookie, {
        uploadId: await uploadId(cookie, jpegWithExif()),
        docType: 'PAN',
      })
      expect(missingLast4.status).toBe(400)
      const fullNumber = await addDoc(cookie, {
        uploadId: await uploadId(cookie, jpegWithExif()),
        docType: 'AADHAAR_MASKED',
        idLast4: '123456789012',
      })
      expect(fullNumber.status).toBe(400)
      const pdfSelfie = await addDoc(cookie, {
        uploadId: await uploadId(cookie, tinyPdf()),
        docType: 'SELFIE',
      })
      expect((await json(pdfSelfie)).error.code).toBe('SELFIE_MUST_BE_PHOTO')

      const other = await worker()
      const stolen = await addDoc(cookie, {
        uploadId: await uploadId(other.cookie, jpegWithExif()),
        docType: 'SKILL_CERTIFICATE',
      })
      expect(stolen.status).toBe(404)

      for (let i = 0; i < 6; i++) {
        expect(
          (
            await addDoc(cookie, {
              uploadId: await uploadId(cookie, tinyPdf()),
              docType: 'SKILL_CERTIFICATE',
            })
          ).status,
        ).toBe(201)
      }
      const seventh = await addDoc(cookie, {
        uploadId: await uploadId(cookie, tinyPdf()),
        docType: 'SKILL_CERTIFICATE',
      })
      expect((await json(seventh)).error.code).toBe('TOO_MANY_DOCUMENTS')
    })

    it('lets a draft document be removed, file included', async () => {
      const { cookie } = await worker()
      const doc = await json(
        await addDoc(cookie, {
          uploadId: await uploadId(cookie, jpegWithExif()),
          docType: 'SELFIE',
        }),
      )
      const [row] =
        await sql`select storage_key from verification_documents where id = ${doc.document.id}`
      const removed = await call(
        deleteDocument,
        req('/', { method: 'DELETE', cookie }),
        withId(doc.document.id),
      )
      expect(removed.status).toBe(204)
      expect(await storage.get(row.storage_key)).toBeNull()

      const other = await worker()
      const doc2 = await json(
        await addDoc(cookie, {
          uploadId: await uploadId(cookie, jpegWithExif()),
          docType: 'SELFIE',
        }),
      )
      const notYours = await call(
        deleteDocument,
        req('/', { method: 'DELETE', cookie: other.cookie }),
        withId(doc2.document.id),
      )
      expect(notYours.status).toBe(404)
    })
  })

  describe('documents are only reachable through an audited admin link', () => {
    it('never exposes storage keys, and serves a document only via a valid signed link', async () => {
      const { cookie } = await worker()
      const doc = await json(
        await addDoc(cookie, {
          uploadId: await uploadId(cookie, jpegWithExif()),
          docType: 'SELFIE',
        }),
      )
      const state = await json(
        await call(verificationRoute, req('/api/v1/worker/verification', { cookie })),
      )
      expect(JSON.stringify(state)).not.toMatch(/kyc\/|storageKey|storage_key|\/api\/v1\/files/)
      expect(state.documents).toEqual([
        expect.objectContaining({ id: doc.document.id, docType: 'SELFIE' }),
      ])

      // Non-admins (including the owner) cannot get a link.
      for (const c of [cookie, (await userWithSession(sql, { role: 'CUSTOMER' })).cookie]) {
        const denied = await call(
          adminDocumentUrl,
          req('/', { cookie: c }),
          withId(doc.document.id),
        )
        expect(denied.status).toBe(403)
      }

      const admin = await userWithSession(sql, { role: 'ADMIN' })
      const linkRes = await call(
        adminDocumentUrl,
        req('/', { cookie: admin.cookie, headers: { 'user-agent': 'vitest' } }),
        withId(doc.document.id),
      )
      expect(linkRes.status).toBe(200)
      const link = await json(linkRes)
      expect(link.url).toMatch(/^\/api\/v1\/files\//)
      const audit = await sql`select action, entity_id, admin_user_id from admin_audit_logs`
      expect(audit).toEqual([
        { action: 'DOCUMENT_VIEWED', entity_id: doc.document.id, admin_user_id: admin.userId },
      ])

      const token = link.url.split('/').pop()
      const file = await call(fileRoute, req(link.url), { params: Promise.resolve({ token }) })
      expect(file.status).toBe(200)
      expect(file.headers.get('content-type')).toBe('image/jpeg')
      expect(file.headers.get('x-content-type-options')).toBe('nosniff')
      expect(file.headers.get('cache-control')).toContain('no-store')
      expect(containsText(new Uint8Array(await file.arrayBuffer()), SECRET_GPS)).toBe(false)

      const [row] =
        await sql`select storage_key, mime_type from verification_documents where id = ${doc.document.id}`
      const expired = createFileToken(
        { key: row.storage_key, mimeType: row.mime_type },
        new Date(Date.now() - 10 * 60_000),
      ).token
      const forged = `${token.split('.')[0]}.AAAA`
      for (const bad of [expired, forged, 'not-a-token']) {
        const res = await call(fileRoute, req('/'), { params: Promise.resolve({ token: bad }) })
        expect(res.status).toBe(404)
      }
    })
  })

  describe('profile, skills, pricing and hours', () => {
    it('keeps profile photos private until the professional is verified', async () => {
      const { cookie, workerId } = await worker()
      const photoId = await uploadId(cookie, jpegWithExif(), 'PROFILE_PHOTO')
      const res = await call(
        patchProfile,
        req('/api/v1/worker/profile', {
          method: 'PATCH',
          cookie,
          body: {
            displayName: 'Imran S',
            bio: '',
            yearsExperience: 3,
            languages: ['hi'],
            photoUploadId: photoId,
          },
        }),
      )
      expect(res.status).toBe(200)
      expect((await json(res)).profile).toMatchObject({ hasPhoto: true, bio: null })

      expect((await call(ownPhotoRoute, req('/', { cookie }))).status).toBe(200)
      expect((await call(publicPhotoRoute, req('/'), withId(workerId!))).status).toBe(404)
      await sql`update worker_profiles set verification_status = 'VERIFIED' where id = ${workerId}`
      expect((await call(publicPhotoRoute, req('/'), withId(workerId!))).status).toBe(200)

      // An upload can only be used once.
      const reuse = await call(
        patchProfile,
        req('/api/v1/worker/profile', {
          method: 'PATCH',
          cookie,
          body: {
            displayName: 'Imran S',
            bio: '',
            yearsExperience: 3,
            languages: ['hi'],
            photoUploadId: photoId,
          },
        }),
      )
      expect(reuse.status).toBe(404)
    })

    it('rejects base points outside the service area and unknown languages', async () => {
      const { cookie } = await worker()
      const delhi = await call(
        putServiceArea,
        req('/', { method: 'PUT', cookie, body: { lat: 28.61, lng: 77.2, radiusKm: 5 } }),
      )
      expect((await json(delhi)).error.code).toBe('OUT_OF_SERVICE_AREA')
      const tooFar = await call(
        putServiceArea,
        req('/', { method: 'PUT', cookie, body: { localityId: kothrudId, radiusKm: 40 } }),
      )
      expect(tooFar.status).toBe(400)
      const klingon = await call(
        patchProfile,
        req('/', {
          method: 'PATCH',
          cookie,
          body: { displayName: 'Imran', bio: '', yearsExperience: 1, languages: ['tlh'] },
        }),
      )
      expect(klingon.status).toBe(400)
      const profile = await json(await call(getProfile, req('/', { cookie })))
      expect(JSON.stringify(profile)).not.toContain('photoKey')
    })

    it('prices only services within skills, within bounds, with version checks', async () => {
      const { cookie, workerId } = await worker()
      await completeProfile(cookie)
      const put = (items: unknown[]) =>
        call(putPricing, req('/', { method: 'PUT', cookie, body: { items } }))
      const item = {
        serviceId,
        pricePaise: 30000,
        minChargePaise: 20000,
        negotiable: true,
        active: true,
      }

      expect((await json(await put([{ ...item, serviceId: otherServiceId }]))).error.code).toBe(
        'SERVICE_NOT_IN_SKILLS',
      )
      expect((await put([{ ...item, pricePaise: 4000 }])).status).toBe(400)
      expect((await put([{ ...item, minChargePaise: 90001 }])).status).toBe(400)

      const created = await json(await put([item]))
      expect(created.items).toEqual([
        expect.objectContaining({
          serviceId,
          price: expect.objectContaining({ pricePaise: 30000, version: 1 }),
        }),
      ])
      expect((await json(await put([{ ...item, pricePaise: 35000 }]))).error.code).toBe(
        'STALE_VERSION',
      )
      expect((await put([{ ...item, pricePaise: 35000, version: 1 }])).status).toBe(200)

      const listed = await json(await call(getPricing, req('/', { cookie })))
      expect(listed.items).toHaveLength(1) // only services in the worker's skills

      // Dropping the skill switches the price off.
      await call(
        putSkills,
        req('/', { method: 'PUT', cookie, body: { categoryIds: [otherCategoryId] } }),
      )
      const [p] =
        await sql`select is_active from worker_service_pricing where worker_id = ${workerId}`
      expect(p.is_active).toBe(false)
    })

    it('validates weekly hours and refuses time off over confirmed jobs', async () => {
      const { cookie, workerId } = await worker()
      const put = (rules: unknown[]) =>
        call(putAvailability, req('/', { method: 'PUT', cookie, body: { rules } }))
      expect(
        (
          await put([
            { weekday: 0, startMinute: 540, endMinute: 720 },
            { weekday: 0, startMinute: 700, endMinute: 900 },
          ])
        ).status,
      ).toBe(400)
      expect(
        (
          await put(
            [0, 1, 2, 3].map((i) => ({
              weekday: 2,
              startMinute: i * 120,
              endMinute: i * 120 + 60,
            })),
          )
        ).status,
      ).toBe(400)
      expect((await put([{ weekday: 0, startMinute: 540, endMinute: 500 }])).status).toBe(400)
      expect(
        (
          await put([
            { weekday: 0, startMinute: 540, endMinute: 1080 },
            { weekday: 5, startMinute: 600, endMinute: 840 },
          ])
        ).status,
      ).toBe(200)
      expect((await json(await call(getAvailability, req('/', { cookie })))).rules).toHaveLength(2)

      // A confirmed job tomorrow 10:00–11:00.
      await sql`insert into worker_skills (worker_id, category_id) values (${workerId}, ${categoryId})`
      const f = fixtures(sql)
      const b = await f.booking({
        customerId: await f.customer(),
        categoryId,
        serviceId,
        workerId: workerId!,
      })
      const tomorrow10 = new Date(Date.now() + 86_400_000)
      tomorrow10.setUTCMinutes(0, 0, 0)
      await f.confirm({ ...b, workerId: workerId!, start: tomorrow10 })

      const off = (start: Date, hours: number) =>
        call(
          addTimeOff,
          req('/', {
            cookie,
            body: {
              start: start.toISOString(),
              end: new Date(start.getTime() + hours * 3_600_000).toISOString(),
              reason: 'Wedding',
            },
          }),
        )
      const clash = await off(new Date(tomorrow10.getTime() - 3_600_000), 3)
      expect(clash.status).toBe(409)
      const clashBody = await json(clash)
      expect(clashBody.error.code).toBe('TIME_OFF_CONFLICT')
      expect(clashBody.error.details.bookings).toHaveLength(1)

      const later = new Date(tomorrow10.getTime() + 2 * 86_400_000)
      const ok = await off(later, 5)
      expect(ok.status).toBe(201)
      expect((await json(await off(new Date(later.getTime() + 3_600_000), 2))).error.code).toBe(
        'TIME_OFF_OVERLAP',
      )

      const id = (await json(ok)).timeOff.id
      const other = await worker()
      expect(
        (
          await call(
            deleteTimeOff,
            req('/', { method: 'DELETE', cookie: other.cookie }),
            withId(id),
          )
        ).status,
      ).toBe(404)
      expect(
        (await call(deleteTimeOff, req('/', { method: 'DELETE', cookie }), withId(id))).status,
      ).toBe(204)
    })
  })

  describe('online status', () => {
    it('lets only verified professionals go online, and keeps them fresh with heartbeats', async () => {
      const { cookie, workerId } = await worker()
      const blocked = await call(statusRoute, req('/', { cookie, body: { online: true } }))
      expect((await json(blocked)).error.code).toBe('NOT_VERIFIED')

      await sql`update worker_profiles set verification_status = 'VERIFIED' where id = ${workerId}`
      const online = await json(
        await call(statusRoute, req('/', { cookie, body: { online: true } })),
      )
      expect(online.status).toMatchObject({ online: true, pausedUntil: null })

      await sql`update worker_profiles set last_active_at = now() - interval '1 hour' where id = ${workerId}`
      expect((await call(presenceRoute, req('/', { cookie, body: {} }))).status).toBe(200)
      const [w] =
        await sql`select last_active_at > now() - interval '1 minute' as fresh from worker_profiles where id = ${workerId}`
      expect(w.fresh).toBe(true)

      const until = new Date(Date.now() + 2 * 86_400_000).toISOString()
      const paused = await json(
        await call(statusRoute, req('/', { cookie, body: { online: false, pausedUntil: until } })),
      )
      expect(paused.status).toMatchObject({ online: false, pausedUntil: until })
      const tooLong = await call(
        statusRoute,
        req('/', {
          cookie,
          body: {
            online: false,
            pausedUntil: new Date(Date.now() + 40 * 86_400_000).toISOString(),
          },
        }),
      )
      expect(tooLong.status).toBe(400)
    })

    it('shows the setup checklist on the dashboard and keeps customers out', async () => {
      const { cookie } = await worker()
      const empty = await json(await call(dashboardRoute, req('/', { cookie })))
      expect(empty.onboarding).toMatchObject({ completed: 0, next: { key: 'profile' } })
      await completeProfile(cookie)
      const later = await json(await call(dashboardRoute, req('/', { cookie })))
      expect(later.onboarding).toMatchObject({ completed: 3, next: { key: 'pricing' } })

      const customer = await userWithSession(sql, { role: 'CUSTOMER' })
      expect((await call(dashboardRoute, req('/', { cookie: customer.cookie }))).status).toBe(403)
      expect((await call(getProfile, req('/', { cookie: customer.cookie }))).status).toBe(403)
    })
  })
})
