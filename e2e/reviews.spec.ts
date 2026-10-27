import { expect, test } from '@playwright/test'
import postgres from 'postgres'
import { expectAccessible, signInAs } from './helpers'

// A professional replies to a review and reports another; a customer saves a professional.

const sql = postgres(process.env.DATABASE_URL!, {
  max: 1,
  onnotice: () => {},
  // Closes itself when idle, rather than in afterAll: a worker may run this file again.
  idle_timeout: 5,
})
// Tests run in parallel workers, so each deletes only the sessions it made.
const tag = () => `e2e reviews ${test.info().testId}`

test.afterEach(async () => {
  await sql`delete from auth_sessions where user_agent = ${tag()}`
})

test('a professional replies to a review and reports another', async ({ page }, info) => {
  // Two published reviews without a reply for one professional (each run uses new ones).
  const [pro] = await sql<{ userId: string; workerId: string }[]>`
    select w.user_id as "userId", w.id as "workerId" from worker_profiles w
    join users u on u.id = w.user_id
    where w.verification_status = 'VERIFIED' and u.phone not in ('+919000000101', '+919000000102')
      and (select count(*) from reviews r where r.worker_id = w.id and r.status = 'PUBLISHED'
           and r.worker_reply is null and r.comment is not null) >= 2
    order by w.id
    offset ${info.project.name === 'mobile' ? 1 : 0} limit 1`
  test.skip(!pro, 'Needs the seeded demo data (npm run db:seed)')
  await signInAs(sql, page.context(), info.project.use.baseURL!, pro.userId, { tag: tag() })

  await page.goto('/worker/reviews')
  await expect(page.getByRole('heading', { name: 'Your reviews' })).toBeVisible()
  const open = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Reply' }) })
  await open.first().getByRole('button', { name: 'Reply' }).click()
  await page.getByLabel(/Your reply to/).fill('Thank you for booking with me!')
  await page.getByRole('button', { name: 'Post reply' }).click()
  await expect(page.getByText('Your reply: Thank you for booking with me!').first()).toBeVisible()

  await page.getByRole('button', { name: 'Report this review' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Report this review?' })
  await dialog.getByLabel(/What is wrong with it/).fill('This review is about a different job.')
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Report this review' }).click()
  await expect(page.getByText('Reported: being checked').first()).toBeVisible()
})

test('a customer saves a professional and finds them under Saved', async ({ page }, info) => {
  const [customer] = await sql<{ id: string }[]>`
    select id from users where phone = ${info.project.name === 'mobile' ? '+919000000005' : '+919000000004'}`
  const [pro] = await sql<{ workerId: string; name: string }[]>`
    select w.id as "workerId", w.display_name as name from worker_profiles w
    join users u on u.id = w.user_id
    where w.verification_status = 'VERIFIED' and u.status = 'ACTIVE'
      and not exists (select 1 from favorites f where f.customer_id = ${customer?.id ?? null} and f.worker_id = w.id)
    order by w.id limit 1`
  test.skip(!customer || !pro, 'Needs the seeded demo data (npm run db:seed)')
  await signInAs(sql, page.context(), info.project.use.baseURL!, customer.id, { tag: tag() })

  await page.goto(`/professionals/${pro.workerId}`)
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await expect(save).toHaveAttribute('aria-pressed', 'false')
  await save.click()
  await expect(page.getByRole('button', { name: 'Saved' })).toHaveAttribute('aria-pressed', 'true')

  await page.goto('/favorites')
  await expect(page.getByRole('link', { name: pro.name })).toBeVisible()
  await expectAccessible(page)
  // Leave the data as it was for the next run.
  await sql`delete from favorites where customer_id = ${customer.id} and worker_id = ${pro.workerId}`
})
