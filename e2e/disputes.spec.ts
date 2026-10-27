import { expect, test } from '@playwright/test'
import postgres from 'postgres'
import { expectAccessible, signInAs } from './helpers'

// A customer reports a problem with a paid job; an admin settles it with a partial refund.
// A professional asks support a question and gets an answer.

const sql = postgres(process.env.DATABASE_URL!, {
  max: 1,
  onnotice: () => {},
  // Closes itself when idle, rather than in afterAll: a worker may run this file again.
  idle_timeout: 5,
})
// Tests run in parallel workers, so each deletes only the sessions it made.
const tag = () => `e2e disputes ${test.info().testId}`

test.afterEach(async () => {
  await sql`delete from auth_sessions where user_agent = ${tag()}`
})

test('a reported problem is settled with a partial refund', async ({ page }, info) => {
  test.slow()
  const baseURL = info.project.use.baseURL!
  // Claim a paid job with no report yet, in one statement: moving it into the 72-hour
  // window also takes it out of the pool, so parallel runs never pick the same job.
  const [job] = await sql<{ id: string; customerId: string }[]>`
    update bookings set completed_at = now() - interval '1 hour'
    where id = (
      select b.id from bookings b
      join payments p on p.booking_id = b.id and p.status = 'CAPTURED'
      where b.status = 'COMPLETED' and b.completed_at < now() - interval '2 hours'
        and not exists (select 1 from disputes d where d.booking_id = b.id)
      order by b.id limit 1
      for update of b skip locked)
    returning id, customer_id as "customerId"`
  test.skip(!job, 'Needs the seeded demo data (npm run db:seed)')

  await signInAs(sql, page.context(), baseURL, job.customerId, { tag: tag() })
  await page.goto(`/bookings/${job.id}`)
  await page.getByRole('button', { name: 'Report a problem' }).click()
  const dialog = page.getByRole('dialog', { name: 'Report a problem' })
  await dialog
    .getByLabel(/What went wrong/)
    .selectOption({ label: 'The work was not done properly' })
  await dialog
    .getByLabel(/Tell us what happened/)
    .fill('The drain is blocked again the next morning.')
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Send report' }).click()
  await expect(page.getByRole('heading', { name: 'You reported a problem' })).toBeVisible()

  const [dispute] = await sql<
    { id: string }[]
  >`select id from disputes where booking_id = ${job.id} and status = 'OPEN'`
  const [admin] = await sql<
    { id: string }[]
  >`select id from users where email = 'admin@kaamico.local'`
  await signInAs(sql, page.context(), baseURL, admin.id, { scope: 'ADMIN', tag: tag() })
  await page.goto(`/admin/disputes/${dispute.id}`)
  await expect(page.getByText('The drain is blocked again the next morning.')).toBeVisible()
  await page.getByText('Split', { exact: true }).click()
  await page.getByLabel(/Refund to the customer/).fill('50')
  await page.getByLabel(/Decision note/).fill('Partial refund for the repeat visit.')
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Record decision' }).click()
  await expect(page.getByText(/Resolved with a partial refund/)).toBeVisible()

  await signInAs(sql, page.context(), baseURL, job.customerId, { tag: tag() })
  await page.goto(`/bookings/${job.id}`)
  await expect(
    page.getByRole('status').filter({ hasText: 'Resolved with a partial refund' }),
  ).toContainText('₹50')
  await expect(page.getByText('Partial refund for the repeat visit.')).toBeVisible()
})

test('a professional asks support and gets a reply', async ({ page }, info) => {
  const baseURL = info.project.use.baseURL!
  const [pro] = await sql<{ userId: string }[]>`
    select w.user_id as "userId" from worker_profiles w join users u on u.id = w.user_id
    where w.verification_status = 'VERIFIED' and u.phone not in ('+919000000101', '+919000000102')
    order by w.id offset ${info.project.name === 'mobile' ? 3 : 2} limit 1`
  test.skip(!pro, 'Needs the seeded demo data (npm run db:seed)')
  await signInAs(sql, page.context(), baseURL, pro.userId, { tag: tag() })

  await page.goto('/worker/support')
  await page.getByLabel(/Topic/).selectOption({ label: 'ID verification' })
  await page.getByLabel(/Subject/).fill('Renewing my ID')
  await page
    .getByLabel(/How can we help/)
    .fill('My driving licence expires next month. What should I do?')
  await page.getByRole('button', { name: 'Send to Kaamico' }).click()
  await expect(page).toHaveURL(/\/worker\/support\/[\w-]+$/)
  const ticketId = page.url().split('/').at(-1)!

  const [admin] = await sql<
    { id: string }[]
  >`select id from users where email = 'admin@kaamico.local'`
  await signInAs(sql, page.context(), baseURL, admin.id, { scope: 'ADMIN', tag: tag() })
  await page.goto(`/admin/support/${ticketId}`)
  await page
    .getByLabel('Reply as Kaamico support')
    .fill('Upload the new licence from the verification page.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  // The box clears only once the reply is saved.
  await expect(page.getByLabel('Reply as Kaamico support')).toHaveValue('')
  await expect(
    page
      .getByRole('list', { name: 'Messages' })
      .getByText('Upload the new licence from the verification page.'),
  ).toBeVisible()

  await signInAs(sql, page.context(), baseURL, pro.userId, { tag: tag() })
  await page.goto(`/worker/support/${ticketId}`)
  await expect(page.getByText(/Kaamico support ·/)).toBeVisible()
  await expectAccessible(page)
})
