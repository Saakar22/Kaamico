import { createHash, randomBytes } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import postgres from 'postgres'
import { expectAccessible } from './helpers'

// Every signed-in P0 route, checked for serious accessibility violations and for
// horizontal scrolling at phone (360 px) and desktop widths. Sessions are written straight
// into the database, so these tests never race the OTP-based specs for the same numbers.

type Role = 'customer' | 'worker' | 'admin'
type Target = { role: Role; path: string }

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
const tokens: Partial<Record<Role, string>> = {}
let targets: Target[] = []

async function one<T extends Record<string, unknown>>(query: Promise<T[]>): Promise<T | undefined> {
  return (await query)[0]
}

async function mintSession(userId: string, scope: 'USER' | 'ADMIN') {
  const token = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(token).digest('hex')
  await sql`insert into auth_sessions (token_hash, user_id, scope, expires_at, user_agent)
    values (${hash}, ${userId}, ${scope}, now() + interval '1 hour', 'e2e routes spec')`
  return token
}

/** Looks up seeded records for the detail pages; routes without a record are left out. */
async function discover(): Promise<Target[]> {
  const priya = await one(sql<{ id: string }[]>`select id from users where phone = '+919000000001'`)
  const rakesh = await one(
    sql<{ id: string; workerId: string }[]>`
      select u.id, w.id as "workerId" from users u join worker_profiles w on w.user_id = u.id
      where u.phone = '+919000000101'`,
  )
  const admin = await one(
    sql<{ id: string }[]>`select id from users where email = 'admin@kaamico.local'`,
  )
  if (!priya || !rakesh || !admin) return []
  tokens.customer = await mintSession(priya.id, 'USER')
  tokens.worker = await mintSession(rakesh.id, 'USER')
  tokens.admin = await mintSession(admin.id, 'ADMIN')

  const customerBooking = (status: string) =>
    one(
      sql<{ id: string }[]>`select id from bookings where customer_id = ${priya.id}
        and status = ${status} order by created_at desc limit 1`,
    )
  const confirmed = await customerBooking('CONFIRMED')
  const requested = await customerBooking('REQUESTED')
  const paid = await one(
    sql<{ id: string }[]>`select b.id from bookings b join invoices i on i.booking_id = b.id
      where b.customer_id = ${priya.id} order by i.issued_at desc limit 1`,
  )
  const reviewable = await one(
    sql<{ id: string }[]>`select b.id from bookings b where b.customer_id = ${priya.id}
      and b.status = 'COMPLETED' and b.completed_at > now() - interval '13 days'
      and not exists (select 1 from reviews r where r.booking_id = b.id) limit 1`,
  )
  const service = await one(
    sql<{ serviceId: string }[]>`select service_id as "serviceId" from worker_service_pricing
      where worker_id = ${rakesh.workerId} and is_active limit 1`,
  )
  const request = await one(
    sql<{ id: string }[]>`select i.id from booking_invitations i
      join bookings b on b.id = i.booking_id
      where i.worker_id = ${rakesh.workerId} and b.status in ('REQUESTED', 'NEGOTIATING')
      order by b.created_at desc limit 1`,
  )
  const job = await one(
    sql<{ id: string }[]>`select id from bookings where worker_id = ${rakesh.workerId}
      and status = 'COMPLETED' order by completed_at desc limit 1`,
  )
  const application = await one(
    sql<{ id: string }[]>`select id from verification_applications
      where status = 'SUBMITTED' order by submitted_at limit 1`,
  )
  const anyBooking = confirmed ?? requested

  const optional = (role: Role, path: string | undefined) => (path ? [{ role, path }] : [])
  return [
    { role: 'customer', path: '/dashboard' },
    { role: 'customer', path: '/bookings' },
    { role: 'customer', path: '/bookings?tab=past' },
    ...optional('customer', confirmed && `/bookings/${confirmed.id}`),
    ...optional('customer', requested && `/bookings/${requested.id}/negotiate`),
    ...optional('customer', paid && `/bookings/${paid.id}/receipt`),
    ...optional('customer', reviewable && `/bookings/${reviewable.id}/review`),
    ...optional('customer', service && `/book/${service.serviceId}?worker=${rakesh.workerId}`),
    { role: 'customer', path: `/professionals/${rakesh.workerId}` },
    { role: 'worker', path: '/worker/dashboard' },
    { role: 'worker', path: '/worker/onboarding' },
    { role: 'worker', path: '/worker/requests' },
    ...optional('worker', request && `/worker/requests/${request.id}`),
    { role: 'worker', path: '/worker/bookings' },
    { role: 'worker', path: '/worker/bookings?tab=completed' },
    ...optional('worker', job && `/worker/bookings/${job.id}`),
    { role: 'worker', path: '/worker/earnings' },
    { role: 'worker', path: '/worker/pricing' },
    { role: 'worker', path: '/worker/availability' },
    { role: 'worker', path: '/worker/profile' },
    { role: 'worker', path: '/worker/verification' },
    { role: 'admin', path: '/admin' },
    { role: 'admin', path: '/admin/verifications' },
    ...optional('admin', application && `/admin/verifications/${application.id}`),
    { role: 'admin', path: '/admin/bookings' },
    ...optional('admin', anyBooking && `/admin/bookings/${anyBooking.id}`),
    { role: 'admin', path: '/admin/users' },
    { role: 'admin', path: '/admin/categories' },
    { role: 'admin', path: '/admin/audit-logs' },
  ]
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement
    return root.scrollWidth - root.clientWidth
  })
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(1)
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  targets = await discover()
})

test.afterAll(async () => {
  await sql`delete from auth_sessions where user_agent = 'e2e routes spec'`
  await sql.end()
})

test('every signed-in P0 route is accessible and fits the screen', async ({ page, isMobile }) => {
  test.skip(targets.length === 0, 'Needs the seeded demo data (npm run db:seed)')
  test.setTimeout(targets.length * 20_000)
  // The narrowest phones the plan supports; the desktop project stays at 1280 px.
  if (isMobile) await page.setViewportSize({ width: 360, height: 780 })

  const failures: string[] = []
  for (const { role, path } of targets) {
    await page.context().clearCookies()
    await page
      .context()
      .addCookies([
        { name: 'kmc_session', value: tokens[role]!, url: test.info().project.use.baseURL! },
      ])
    await test.step(`${role} ${path}`, async () => {
      try {
        const response = await page.goto(path)
        expect(response?.status(), 'status').toBe(200)
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
        await expectAccessible(page)
        await expectNoHorizontalScroll(page)
      } catch (error) {
        failures.push(`${role} ${path}: ${error instanceof Error ? error.message : error}`)
      }
    })
  }
  expect(failures).toEqual([])
})
