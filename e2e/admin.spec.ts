import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import postgres from 'postgres'
import { expectAccessible } from './helpers'

// An admin reviews a new professional's ID (each document view is audited), rejects it
// with a reason the professional then sees, inspects a booking and finds every action
// in the audit log.

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'kaamico-admin-dev'
const STORAGE = process.env.STORAGE_LOCAL_DIR ?? './storage'
// A 1×1 PNG, enough for the viewer to show an image.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  try {
    return await fn(sql)
  } finally {
    await sql.end()
  }
}

/** A professional who has just submitted an ID document and a selfie (files on disk). */
async function newApplicant() {
  const mobile = `8${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`
  const name = `Kiran ${mobile.slice(-4)}`
  return withDb(async (sql) => {
    const [u] = await sql`insert into users (phone, phone_verified_at, name, roles)
      values (${`+91${mobile}`}, now(), ${name}, '{WORKER}') returning id`
    const [w] = await sql`insert into worker_profiles (user_id, display_name, verification_status)
      values (${u.id}, ${name}, 'PENDING') returning id`
    // Submitted long ago, so it sits at the front of the oldest-first queue.
    const [app] = await sql`insert into verification_applications (worker_id, status, submitted_at)
      values (${w.id}, 'SUBMITTED', now() - interval '30 days') returning id`
    for (const docType of ['AADHAAR_MASKED', 'SELFIE']) {
      const key = `e2e/${randomUUID()}/${docType.toLowerCase().replace('_', '-')}`
      const file = path.resolve(STORAGE, ...key.split('/'))
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, PNG)
      await sql`insert into verification_documents
        (application_id, doc_type, id_last4, storage_key, mime_type, size_bytes, sha256)
        values (${app.id}, ${docType}, ${docType === 'SELFIE' ? null : '4321'}, ${key}, 'image/png',
                ${PNG.length}, ${'0'.repeat(64)})`
    }
    return { mobile, name, applicationId: app.id as string }
  })
}

async function signInAdmin(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill('admin@kaamico.local')
  await page.getByLabel('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/admin$/)
}

test('an admin reviews an ID, rejects it with a reason and finds it in the audit log', async ({
  page,
  browser,
}) => {
  test.slow()
  const applicant = await newApplicant()
  await signInAdmin(page)
  await expect(page.getByText('Verifications to review')).toBeVisible()
  await expectAccessible(page)

  // Queue → application
  await page.getByRole('link', { name: /Verifications to review/ }).click()
  await expect(page).toHaveURL(/\/admin\/verifications$/)
  await page.getByRole('link', { name: applicant.name }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(applicant.name)
  await expect(page.getByText('No admin has opened this application yet.')).toBeVisible()

  // Viewing a document is audited
  await page.getByRole('button', { name: 'View Masked Aadhaar' }).click()
  const viewer = page.getByRole('dialog', { name: 'Masked Aadhaar' })
  await expect(viewer.getByRole('img', { name: 'Masked Aadhaar' })).toBeVisible()
  await viewer.getByRole('button', { name: 'Close' }).click()
  const views = await withDb(
    (sql) => sql`select count(*)::int as n from admin_audit_logs l
      join verification_documents d on d.id::text = l.entity_id
      where l.action = 'DOCUMENT_VIEWED' and d.application_id = ${applicant.applicationId}`,
  )
  expect(views[0].n).toBe(1)
  await expectAccessible(page)

  // Reject with a reason
  const reason = 'The Aadhaar photo is cut off. Upload the full card, please.'
  await page.getByText('Reject', { exact: true }).click()
  await page.getByLabel(/^Reason \(shown to/).fill(reason)
  await page.getByRole('button', { name: 'Reject' }).click()
  await expect(page.getByText(/^Rejected by Kaamico Admin on/)).toBeVisible()
  await expect(page.getByText(reason)).toBeVisible()
  await expect(page.getByText(/document viewed/)).toBeVisible()

  // The professional sees the reason
  const workerContext = await browser.newContext()
  const worker = await workerContext.newPage()
  await worker.goto('/login')
  await worker.getByLabel('Mobile number').fill(applicant.mobile)
  await worker.getByRole('button', { name: 'Send code' }).click()
  const code = await worker.getByTestId('simulated-otp').textContent()
  await worker.getByLabel('6-digit code').fill(code!.trim())
  await worker.getByRole('button', { name: 'Verify and continue' }).click()
  await expect(worker).toHaveURL(/\/worker\/dashboard$/)
  await worker.goto('/worker/verification')
  await expect(worker.getByText(reason).first()).toBeVisible()
  await workerContext.close()

  // Inspect a booking with its history
  const [booking] = await withDb(
    (sql) =>
      sql`select id, code from bookings where status = 'COMPLETED' order by created_at limit 1`,
  )
  test.skip(!booking, 'Needs the seeded demo data (npm run db:seed)')
  await page.goto(`/admin/bookings?q=${booking.code}`)
  await page.getByRole('link', { name: booking.code }).click()
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Offers' })).toBeVisible()
  await expectAccessible(page)

  // The audit log has both actions for this application
  await page.goto(`/admin/audit-logs?entityId=${applicant.applicationId}`)
  await expect(page.getByRole('cell', { name: 'verification rejected' })).toBeVisible()
  await expect(page.getByRole('cell', { name: reason })).toBeVisible()
  await page.goto('/admin/audit-logs?action=DOCUMENT_VIEWED')
  await expect(page.getByRole('cell', { name: 'document viewed' }).first()).toBeVisible()
  await expectAccessible(page)
})

test('admin pages pass an accessibility check', async ({ page }) => {
  test.slow()
  await signInAdmin(page)
  for (const path of ['/admin/users', '/admin/categories', '/admin/bookings']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectAccessible(page)
  }
})
