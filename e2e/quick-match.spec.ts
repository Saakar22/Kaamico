import { expect, test } from '@playwright/test'
import postgres from 'postgres'
import { expectAccessible, signInAs } from './helpers'

// A customer sends a quick match; one of the invited professionals accepts in a second
// browser; the customer lands on the confirmed booking with that professional.

const sql = postgres(process.env.DATABASE_URL!, {
  max: 1,
  onnotice: () => {},
  // Closes itself when idle, rather than in afterAll: a worker may run this file again.
  idle_timeout: 5,
})
const tag = () => `e2e quick match ${test.info().testId}`

test.afterEach(async () => {
  await sql`delete from auth_sessions where user_agent = ${tag()}`
})

/** Cancels this customer's quick matches, so their professionals are free for the next run. */
async function releaseQuickMatches(customerId: string) {
  await sql`update bookings set status = 'CANCELLED', cancelled_by = 'ADMIN', cancelled_at = now(),
      cancellation_reason = 'Test clean-up', version = version + 1
    where customer_id = ${customerId} and mode = 'BROADCAST'
      and status in ('REQUESTED', 'NEGOTIATING', 'CONFIRMED')`
}

test('a quick match is booked by the first professional to accept', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000)
  const baseURL = info.project.use.baseURL!
  // Desktop and mobile use customers in different cities, so their matches never overlap.
  const phone = info.project.name === 'mobile' ? '+919000000004' : '+919000000003'
  const [customer] = await sql<{ id: string; lat: number; lng: number }[]>`
    select u.id, a.lat, a.lng from users u join addresses a on a.user_id = u.id
    where u.phone = ${phone} limit 1`
  const [service] = await sql<{ id: string }[]>`select id from services where slug = 'tap-repair'`
  test.skip(!customer || !service, 'Needs the seeded demo data (npm run db:seed)')

  // Earlier runs left their professionals booked "now": release them first.
  await releaseQuickMatches(customer.id)

  // Seeded "online" times go stale: make the plumbers who reach this address free now.
  const pros = await sql<{ workerId: string; userId: string }[]>`
    update worker_profiles w set is_online = true, last_active_at = now(), paused_until = null
    from users u, worker_service_pricing p
    where u.id = w.user_id and p.worker_id = w.id and p.service_id = ${service.id} and p.is_active
      and w.verification_status = 'VERIFIED' and u.status = 'ACTIVE'
      and u.phone not in ('+919000000101', '+919000000102')
      and kaamico_haversine_km(${customer.lat}, ${customer.lng}, w.base_lat, w.base_lng) <= w.service_radius_km
    returning w.id as "workerId", w.user_id as "userId"`
  test.skip(pros.length === 0, 'No professional reaches this customer')

  await signInAs(sql, page.context(), baseURL, customer.id, { tag: tag() })
  await page.goto(`/book/${service.id}/quick`)
  await expect(page.getByRole('heading', { name: /Quick match: Tap repair/ })).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Send to nearby professionals' }).click()
  await expect(page).toHaveURL(/\/bookings\/[\w-]+\/negotiate$/)
  await expect(page.getByRole('heading', { name: 'Finding a professional' })).toBeVisible()
  await expectAccessible(page)
  const bookingId = page.url().split('/').at(-2)!

  // One invited professional accepts the customer's request at their listed price.
  const [invite] = await sql<{ id: string; userId: string; name: string }[]>`
    select i.id, w.user_id as "userId", w.display_name as name from booking_invitations i
    join worker_profiles w on w.id = i.worker_id
    where i.booking_id = ${bookingId} order by i.distance_km limit 1`
  const workerContext = await browser.newContext()
  const worker = await workerContext.newPage()
  await signInAs(sql, workerContext, baseURL, invite.userId, { tag: tag() })
  await worker.goto(`/worker/requests/${invite.id}`)
  await expect(worker.getByText(/first to accept gets the job/)).toBeVisible()
  await worker.getByRole('button', { name: /^Accept ₹/ }).click()
  // Accepting confirms the job and opens it.
  await expect(worker.getByRole('button', { name: "I'm on my way" })).toBeVisible()
  await workerContext.close()

  // The customer's page refreshes itself and moves on to the booking.
  await page.goto(`/bookings/${bookingId}`)
  await expect(page.getByRole('link', { name: invite.name })).toBeVisible()
  await expect(page.getByLabel(/^Start code \d \d \d \d$/)).toBeVisible()
  await releaseQuickMatches(customer.id)
})
