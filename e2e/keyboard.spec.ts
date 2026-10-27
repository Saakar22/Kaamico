import { expect, test, type Locator, type Page } from '@playwright/test'
import postgres from 'postgres'

// The customer's half of booking and negotiation, using only the keyboard: every control
// must be reachable with Tab and work with Enter, Space, arrows or typing.

type Pro = { workerId: string; phone: string; serviceId: string; name: string }

/** A third negotiable plumber near Kothrud, so this never takes a slot booking.spec uses. */
async function plumberNearKothrud(): Promise<Pro | undefined> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  try {
    const rows = await sql<Pro[]>`
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
      offset 2 limit 1`
    return rows[0]
  } finally {
    await sql.end()
  }
}

/**
 * Presses Tab until `target` (or, for a radio group, any of its radios) has focus;
 * fails if it is not in the tab order.
 */
async function tabTo(page: Page, target: Locator, maxPresses = 80) {
  for (let i = 0; i < maxPresses; i++) {
    if (await target.evaluateAll((els) => els.some((el) => el === document.activeElement))) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Could not reach ${target} with the Tab key`)
}

/** With focus inside a radio group, moves to `radio` with the arrow keys and selects it. */
async function chooseRadio(page: Page, radio: Locator) {
  for (let i = 0; i < 4 && !(await radio.isChecked()); i++) {
    const focused = await radio.evaluate((el) => el === document.activeElement)
    await page.keyboard.press(focused ? 'Space' : 'ArrowDown')
  }
  await expect(radio).toBeChecked()
}

async function signIn(page: Page, mobile: string) {
  await page.goto('/login')
  await tabTo(page, page.getByLabel('Mobile number'))
  await page.keyboard.type(mobile)
  await page.keyboard.press('Enter')
  const code = (await page.getByTestId('simulated-otp').textContent())!.trim()
  await expect(page.getByLabel('6-digit code')).toBeVisible()
  await tabTo(page, page.getByLabel('6-digit code'))
  await page.keyboard.type(code)
  await page.keyboard.press('Enter')
}

test('a customer books and accepts a counteroffer using only the keyboard', async ({
  browser,
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Keyboard-only use is a desktop concern')
  test.slow()
  const pro = await plumberNearKothrud()
  test.skip(!pro, 'Needs the seeded demo data (npm run db:seed)')
  const proFirst = pro!.name.split(' ')[0]

  await signIn(page, `8${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`)
  await tabTo(page, page.getByLabel(/Your name/))
  await page.keyboard.type('Kavya Rao')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.goto(`/professionals/${pro!.workerId}?service=${pro!.serviceId}`)
  await tabTo(page, page.getByRole('link', { name: 'Request booking' }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Where is the job?' })).toBeVisible()

  // Address
  await tabTo(page, page.getByLabel(/Flat, house and street/))
  await page.keyboard.type('B-4, Karve Nagar Road')
  await tabTo(page, page.getByLabel(/^Area/))
  await page.keyboard.type('Kothrud')
  await expect(page.getByLabel(/^Area/)).toHaveValue(/.+/)
  await tabTo(page, page.getByRole('button', { name: 'Save address' }))
  await page.keyboard.press('Enter')
  await tabTo(page, page.getByRole('button', { name: 'Continue' }))
  await page.keyboard.press('Enter')

  // Time: the radio group moves with arrow keys; days with the closed select's arrows
  const when = page.getByRole('radiogroup', { name: 'When' })
  await tabTo(page, when.getByRole('radio'))
  await chooseRadio(page, when.getByRole('radio', { name: /Choose a time/ }))
  const day = page.getByLabel('Day')
  await tabTo(page, day)
  const slots = page.getByRole('group', { name: 'Start time (IST)' }).getByRole('button')
  for (let i = 0; i < 7 && !(await slots.first().isVisible()); i++) {
    await page.keyboard.press('ArrowDown')
    await expect(slots.first().or(page.getByText('No free times that day.'))).toBeVisible()
  }
  await tabTo(page, slots.first())
  await page.keyboard.press('Enter')
  await tabTo(page, page.getByRole('button', { name: 'Continue' }))
  await page.keyboard.press('Enter')

  // Details
  await tabTo(page, page.getByLabel(/What needs doing/))
  await page.keyboard.type('Bathroom tap leaks at the base.')
  await tabTo(page, page.getByRole('button', { name: 'Continue' }))
  await page.keyboard.press('Enter')

  // Price: suggest the floor
  const price = page.getByRole('radiogroup', { name: 'Price' })
  const offer = price.getByRole('radio', { name: 'Suggest a different price' })
  await tabTo(page, price.getByRole('radio'))
  await chooseRadio(page, offer)
  const hint = (await page.getByText(/^Between ₹/).textContent())!
  const floor = Number(hint.split('and')[0].replace(/[^\d]/g, ''))
  await tabTo(page, page.getByLabel('Your offer'))
  await page.keyboard.type(String(floor))
  await tabTo(page, page.getByRole('button', { name: 'Continue' }))
  await page.keyboard.press('Enter')
  await tabTo(page, page.getByRole('button', { name: new RegExp(`Send request to ${proFirst}`) }))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/bookings\/[\w-]+\/negotiate$/)
  const bookingCode = (await page
    .getByText(/KMC-[A-Z0-9]{6}/)
    .first()
    .textContent())!.match(/KMC-[A-Z0-9]{6}/)![0]

  // The professional counters (mouse is fine on their side)
  const workerContext = await browser.newContext()
  const worker = await workerContext.newPage()
  await worker.goto('/login')
  await worker.getByLabel('Mobile number').fill(pro!.phone.slice(3))
  await worker.getByRole('button', { name: 'Send code' }).click()
  const code = await worker.getByTestId('simulated-otp').textContent()
  await worker.getByLabel('6-digit code').fill(code!.trim())
  await worker.getByRole('button', { name: 'Verify and continue' }).click()
  await expect(worker).toHaveURL(/\/worker\/dashboard$/)
  await worker.goto('/worker/requests')
  await worker.getByRole('link', { name: new RegExp(bookingCode) }).click()
  await worker.getByRole('textbox', { name: 'Your price' }).fill(String(floor + 50))
  await worker.getByRole('button', { name: 'Send offer' }).click()
  await expect(worker.getByText(/Waiting for Kavya to respond/)).toBeVisible()
  await workerContext.close()

  // Customer accepts by keyboard; the price is locked
  await page.reload()
  const accept = page.getByRole('button', { name: /^Accept ₹/ })
  await expect(accept).toBeVisible()
  await tabTo(page, accept)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/bookings\/[\w-]+\?confirmed=1$/)
  await expect(page.getByText(/Confirmed · Price locked at ₹/)).toBeVisible()
})
