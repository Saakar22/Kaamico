import { expect, test, type Browser, type Page } from '@playwright/test'
import postgres from 'postgres'
import { expectAccessible } from './helpers'

// A new customer books a seeded professional, makes an offer, the professional
// counters in a second browser, and the customer accepts: price locked, start code shown.

type Pro = { workerId: string; phone: string; serviceId: string; name: string }

async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  try {
    return await fn(sql)
  } finally {
    await sql.end()
  }
}

/** Two seeded plumbers who travel to Kothrud (not Rakesh: other specs sign in as him). */
function plumbersNearKothrud(): Promise<Pro[]> {
  return withDb(
    (sql) => sql<Pro[]>`
      select w.id as "workerId", u.phone, p.service_id as "serviceId", w.display_name as name
      from worker_profiles w
      join users u on u.id = w.user_id
      join worker_service_pricing p on p.worker_id = w.id and p.is_active
      join services s on s.id = p.service_id and s.slug = 'tap-repair'
      where w.verification_status = 'VERIFIED' and u.status = 'ACTIVE' and p.is_negotiable
        and kaamico_haversine_km(18.5074, 73.8077, w.base_lat, w.base_lng) <= w.service_radius_km
        and u.phone not in ('+919000000101', '+919000000102')
        and exists (select 1 from worker_availability_rules r where r.worker_id = w.id)
      order by u.phone
      limit 2`,
  )
}

async function signIn(page: Page, mobile: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(mobile)
  await page.getByRole('button', { name: 'Send code' }).click()
  const code = await page.getByTestId('simulated-otp').textContent()
  await page.getByLabel('6-digit code').fill(code!.trim())
  await page.getByRole('button', { name: 'Verify and continue' }).click()
}

async function newCustomer(browser: Browser, isMobile: boolean) {
  const context = await browser.newContext(
    isMobile ? { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } : {},
  )
  const page = await context.newPage()
  await signIn(page, `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`)
  await page.getByLabel(/Your name/).fill('Meera Joshi')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  return page
}

const rupees = (text: string) => Number(text.replace(/[^\d]/g, ''))

test('a customer books and negotiates; the professional does the job; both track it', async ({
  browser,
  isMobile,
}, info) => {
  // Two browsers through the whole job: ~45 s alone, longer while the suite's
  // accessibility sweeps share the server.
  test.setTimeout(180_000)
  const pros = await plumbersNearKothrud()
  const pro = pros[info.project.name === 'mobile' ? 1 : 0]
  test.skip(!pro, 'Needs the seeded demo data (npm run db:seed)')
  const proFirst = pro.name.split(' ')[0]

  // Customer: profile → wizard
  const customer = await newCustomer(browser, isMobile)
  await customer.goto(`/professionals/${pro.workerId}?service=${pro.serviceId}`)
  await customer.getByRole('link', { name: 'Request booking' }).click()
  await expect(customer.getByRole('heading', { name: 'Where is the job?' })).toBeVisible()

  await customer.getByLabel(/Flat, house and street/).fill('A-12, Shanti Kunj, Paud Road')
  await customer.getByLabel(/^Area/).selectOption({ label: 'Kothrud' })
  await customer.getByRole('button', { name: 'Save address' }).click()
  await customer.getByRole('button', { name: 'Continue' }).click()

  await customer.getByText('Choose a time').click()
  const day = customer.getByRole('radiogroup', { name: 'Day' })
  const options = await day.getByRole('radio').all()
  // Skip today; use the first later day with free times.
  for (const option of options.slice(1)) {
    await option.click()
    const firstSlot = customer
      .getByRole('group', { name: 'Start time (IST)' })
      .getByRole('button')
      .first()
    const none = customer.getByText('No free times that day.')
    await expect(firstSlot.or(none)).toBeVisible()
    if (await firstSlot.isVisible()) {
      await firstSlot.click()
      break
    }
  }
  await customer.getByRole('button', { name: 'Continue' }).click()
  await customer.getByLabel(/What needs doing/).fill('Kitchen tap drips all night.')
  await customer.getByRole('button', { name: 'Continue' }).click()

  await customer.getByText('Suggest a different price').click()
  const hint = await customer.getByText(/^Between ₹/).textContent()
  const floor = rupees(hint!.split('and')[0])
  const listed = rupees(hint!.split('and')[1])
  await customer.getByLabel('Your offer').fill(String(floor))
  await expectAccessible(customer)
  await customer.getByRole('button', { name: 'Continue' }).click()
  await customer.getByRole('button', { name: new RegExp(`Send request to ${proFirst}`) }).click()

  await expect(customer).toHaveURL(/\/bookings\/[\w-]+\/negotiate$/)
  await expect(customer.getByText(`Waiting for ${proFirst} to respond`).first()).toBeVisible()
  const bookingCode = (await customer
    .getByText(/KMC-[A-Z0-9]{6}/)
    .first()
    .textContent())!.match(/KMC-[A-Z0-9]{6}/)![0]
  await expectAccessible(customer)

  // Professional: inbox → counter-offer
  const workerContext = await browser.newContext()
  const worker = await workerContext.newPage()
  await signIn(worker, pro.phone.slice(3))
  await expect(worker).toHaveURL(/\/worker\/dashboard$/)
  await worker.goto('/worker/requests')
  // Earlier runs may have left other requests from "Meera": pick this one by its reference.
  await worker.getByRole('link', { name: new RegExp(bookingCode) }).click()
  await expect(worker.getByText(/Meera offered ₹/)).toBeVisible()
  await expect(
    worker.getByText('The full address appears once the booking is confirmed.'),
  ).toBeVisible()
  const counter = Math.min(listed, floor + 100)
  await worker.getByRole('textbox', { name: 'Your price' }).fill(String(counter))
  await worker.getByRole('button', { name: 'Send offer' }).click()
  await expect(worker.getByText(/Waiting for Meera to respond/)).toBeVisible()
  await expectAccessible(worker)

  // Customer: accept the counter (the page polls; a reload is quicker in tests)
  await customer.reload()
  await expect(customer.getByRole('button', { name: /^Notifications, \d+ unread$/ })).toBeVisible()
  await expect(customer.getByText(new RegExp(`${proFirst} offered ₹`)).first()).toBeVisible()
  await customer.getByRole('button', { name: /^Accept ₹/ }).click()
  await expect(customer).toHaveURL(/\/bookings\/[\w-]+\?confirmed=1$/)
  await expect(customer.getByText(/Confirmed · Price locked at ₹/)).toBeVisible()
  await expect(customer.getByText(/Price locked at ₹/)).toContainText(
    counter.toLocaleString('en-IN'),
  )
  const codeLabel = await customer.getByLabel(/^Start code \d \d \d \d$/).getAttribute('aria-label')
  const startCode = codeLabel!.replace(/\D/g, '')
  await expectAccessible(customer)

  // Professional: the request page now shows the address; the bell leads to the job
  await worker.reload()
  await expect(worker.getByText(/A-12, Shanti Kunj, Paud Road/).first()).toBeVisible()
  await worker.getByRole('button', { name: /^Notifications/ }).click()
  await worker
    .getByRole('link', { name: new RegExp(`Meera confirmed the job.*${bookingCode}`) })
    .click()
  await expect(worker).toHaveURL(/\/worker\/bookings\/[\w-]+$/)
  // The page navigated from stays mounted but hidden, so match visible text only.
  await expect(
    worker.getByText(/A-12, Shanti Kunj, Paud Road/).filter({ visible: true }),
  ).toBeVisible()
  await expectAccessible(worker)

  // Tests cannot wait for a later day's slot: treat the job as on-demand so they can set off now.
  await withDb((sql) => sql`update bookings set timing = 'ON_DEMAND' where code = ${bookingCode}`)
  await worker.getByRole('button', { name: "I'm on my way" }).click()
  await expect(worker.getByText(`On the way · ${bookingCode}`)).toBeVisible()
  await customer.reload()
  await expect(customer.getByText(`${proFirst} is on the way · ${bookingCode}`)).toBeVisible()

  await worker.getByRole('button', { name: "I've arrived" }).click()
  await worker.getByLabel('Start code from Meera').fill(startCode)
  await worker.getByRole('button', { name: 'Start job' }).click()
  await expect(worker.getByText(`Work in progress · ${bookingCode}`)).toBeVisible()

  // Extra charge: proposed on site, approved by the customer, added to the total
  await worker.getByRole('button', { name: 'Add extra charge' }).click()
  await worker.getByLabel(/What is it for/).fill('New tap cartridge')
  await worker.getByRole('textbox', { name: /^Amount/ }).fill('150')
  await worker.getByRole('button', { name: 'Send for approval' }).click()
  await expect(worker.getByText('Waiting for approval')).toBeVisible()
  await expect(worker.getByRole('button', { name: 'Mark job complete' })).toBeDisabled()

  await customer.reload()
  const dialog = customer.getByRole('dialog', { name: `${proFirst} added an extra charge` })
  await expect(dialog.getByText('New tap cartridge')).toBeVisible()
  await expectAccessible(customer)
  await dialog.getByRole('button', { name: /^Approve ₹150/ }).click()
  await expect(dialog).toBeHidden()
  const total = (counter + 150).toLocaleString('en-IN')
  await expect(customer.getByRole('region', { name: 'Price' })).toContainText(`Total₹${total}`)

  await worker.reload()
  await worker.getByRole('button', { name: 'Mark job complete' }).click()
  await expect(worker.getByText(`Completed · ${bookingCode}`)).toBeVisible()

  // Payment: online (simulated) on desktop, after one simulated failure; cash on mobile
  await customer.reload()
  await expect(customer.getByText(`Completed · ${bookingCode}`)).toBeVisible()
  const pay = customer.getByRole('region', { name: /^Pay ₹/ })
  await expect(pay).toContainText(`₹${total}`)
  await expectAccessible(customer)
  const job = worker.url()
  if (info.project.name === 'desktop') {
    await pay.getByRole('button', { name: 'Pay online' }).click()
    await expect(pay.getByText('Simulation: no money moves')).toBeVisible()
    await pay.getByRole('button', { name: 'Simulate a failed payment' }).click()
    await expect(pay.getByRole('alert')).toContainText('Simulated failure')
    await pay.getByRole('button', { name: 'Pay online' }).click()
    await pay.getByRole('button', { name: /^Pay ₹.*\(simulated\)$/ }).click()
  } else {
    await pay.getByRole('button', { name: 'Pay in cash' }).click()
    await expect(customer.getByText(new RegExp(`Hand ₹${total} to ${proFirst}`))).toBeVisible()
    await worker.goto(job)
    await worker.getByRole('button', { name: new RegExp(`^I received ₹${total}`) }).click()
    await expect(worker.getByText(new RegExp(`Meera paid ₹${total} in cash`))).toBeVisible()
    await customer.reload()
  }
  // The professional privately rates the customer.
  await worker.goto(job)
  await worker.getByRole('radio', { name: '4 stars' }).click()
  await worker.getByRole('button', { name: 'Paid promptly' }).click()
  await worker.getByRole('button', { name: 'Save rating' }).click()
  await expect(worker.getByText('You rated Meera 4 out of 5.')).toBeVisible()
  const paid = customer.getByRole('region', { name: /^Paid ₹/ })
  await expect(paid).toContainText(`₹${total}`)
  await paid.getByRole('link', { name: /^Receipt KMC\// }).click()
  await expect(customer.getByRole('heading', { name: 'Receipt' })).toBeVisible()
  await expect(customer.getByRole('cell', { name: 'Extra: New tap cartridge' })).toBeVisible()
  await expect(customer.getByText(/Kaamico fee/)).toHaveCount(0)
  await expectAccessible(customer)

  // Review
  await customer.goBack()
  await customer.getByRole('link', { name: `Rate ${proFirst}` }).click()
  await customer.getByRole('radio', { name: /^5 stars/ }).click()
  await customer.getByRole('button', { name: 'On time' }).click()
  await customer.getByLabel(/Anything else/).fill('Fixed the drip in ten minutes.')
  await expectAccessible(customer)
  await customer.getByRole('button', { name: 'Post review' }).click()
  await expect(customer.getByRole('heading', { name: 'Your review' })).toBeVisible()
  await expect(customer.getByRole('img', { name: '5 out of 5 stars' })).toBeVisible()

  // The professional's earnings include the job, with the fee taken
  await worker.goto('/worker/earnings')
  await expect(worker.getByText('Payouts are simulated: no money is transferred')).toBeVisible()
  await expect(
    worker.getByRole('link', { name: new RegExp(`Tap repair.*· ${bookingCode}`) }),
  ).toBeVisible()
  await expectAccessible(worker)

  // Both sides see it in their history
  await customer.goto('/bookings?tab=past')
  await expect(customer.getByRole('link', { name: new RegExp(bookingCode) })).toBeVisible()
  await expectAccessible(customer)
  await worker.goto('/worker/bookings?tab=completed')
  await expect(worker.getByRole('link', { name: new RegExp(bookingCode) })).toBeVisible()

  await workerContext.close()
  await customer.context().close()
})

test('a customer can cancel a request for free', async ({ browser, isMobile }, info) => {
  const pros = await plumbersNearKothrud()
  const pro = pros[info.project.name === 'mobile' ? 0 : 1]
  test.skip(!pro, 'Needs the seeded demo data (npm run db:seed)')
  const customer = await newCustomer(browser, isMobile)
  await customer.goto(`/book/${pro.serviceId}?worker=${pro.workerId}`)
  await customer.getByLabel(/Flat, house and street/).fill('B-4, Lane 7')
  await customer.getByLabel(/^Area/).selectOption({ label: 'Kothrud' })
  await customer.getByRole('button', { name: 'Save address' }).click()
  await customer.getByRole('button', { name: 'Continue' }).click()
  await customer.getByText('Choose a time').click()
  const day = customer.getByRole('radiogroup', { name: 'Day' })
  for (const option of (await day.getByRole('radio').all()).slice(2)) {
    await option.click()
    const firstSlot = customer
      .getByRole('group', { name: 'Start time (IST)' })
      .getByRole('button')
      .first()
    await expect(firstSlot.or(customer.getByText('No free times that day.'))).toBeVisible()
    if (await firstSlot.isVisible()) {
      await firstSlot.click()
      break
    }
  }
  for (let i = 0; i < 3; i++) await customer.getByRole('button', { name: 'Continue' }).click()
  await customer.getByRole('button', { name: /^Send request to/ }).click()
  await expect(customer).toHaveURL(/\/negotiate$/)

  await customer.getByRole('button', { name: 'Cancel request' }).click()
  const dialog = customer.getByRole('dialog', { name: 'Cancel request?' })
  await expect(dialog.getByText('Cancelling now is free.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel request' }).click()
  await expect(customer.getByText(/^Cancelled ·/)).toBeVisible()
  await expect(customer.getByRole('link', { name: 'Find another professional' })).toBeVisible()
  await customer.context().close()
})
