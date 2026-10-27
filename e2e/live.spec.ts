import { expect, test } from '@playwright/test'
import postgres from 'postgres'
import { signInAs } from './helpers'

// Live updates: a new notification reaches an open page within seconds. The bell only
// polls every 30 s, so seeing it inside 8 s means the server-sent event arrived.

const sql = postgres(process.env.DATABASE_URL!, {
  max: 1,
  onnotice: () => {},
  // Closes itself when idle, rather than in afterAll: a worker may run this file again.
  idle_timeout: 5,
})
const tag = () => `e2e live ${test.info().testId}`

test.afterEach(async () => {
  await sql`delete from auth_sessions where user_agent = ${tag()}`
})

test('a new notification updates the open page at once', async ({ page }, info) => {
  const phone = info.project.name === 'mobile' ? '+919000000006' : '+919000000005'
  const [customer] = await sql<{ id: string }[]>`select id from users where phone = ${phone}`
  test.skip(!customer, 'Needs the seeded demo data (npm run db:seed)')
  await sql`update notifications set read_at = now() where user_id = ${customer.id} and read_at is null`
  await signInAs(sql, page.context(), info.project.use.baseURL!, customer.id, { tag: tag() })

  // Wait for the live connection before changing anything.
  const connected = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/events') && r.status() === 200,
  )
  await page.goto('/dashboard')
  await connected
  const bell = page.getByRole('button', { name: /^Notifications/ })
  await expect(bell).toHaveAccessibleName('Notifications')

  await sql`insert into notifications (user_id, type, title, link)
    values (${customer.id}, 'test', 'Live update check', '/dashboard')`
  await expect(bell).toHaveAccessibleName('Notifications, 1 unread', { timeout: 8_000 })
})
