import { expect, test } from '@playwright/test'
import { jpegWithExif } from '../src/test/files'

// Smoke checks that run against any deployment (tag @smoke):
//   E2E_BASE_URL=https://staging.example.com npm run test:smoke
// They assume simulated OTP (a demo or staging environment) and create one new professional.

test('home page renders the brand @smoke', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Kaamico/)
  await expect(page.getByText('Local Skills. Fair Prices.').first()).toBeVisible()
})

test('health endpoint reports database status @smoke', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  expect(await res.json()).toMatchObject({ status: 'ok', db: { status: 'up' } })
})

test('a production demo says it is a demo on every page @smoke', async ({ page }) => {
  test.skip(!!process.env.E2E_NOT_DEMO, 'This deployment is not a demo')
  test.skip(process.env.E2E_DEV_SERVER === '1', '`next dev` is not a production server')
  for (const path of ['/', '/login', '/terms']) {
    await page.goto(path)
    await expect(page.getByRole('note').filter({ hasText: 'Demo: sign-in codes' })).toBeVisible()
  }
})

test('a professional can sign up and store a photo (private storage round trip) @smoke', async ({
  page,
}) => {
  const mobile = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(mobile)
  await page.getByRole('button', { name: 'Send code' }).click()
  const code = await page.getByTestId('simulated-otp').textContent()
  await page.getByLabel('6-digit code').fill(code!.trim())
  await page.getByRole('button', { name: 'Verify and continue' }).click()
  await page.getByLabel(/Your name/).fill('Smoke Test')
  await page.getByText('Offer my services').click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/worker\/dashboard$/)

  await page.goto('/worker/profile')
  await page.getByLabel(/About you/).fill('Smoke test account created by the deployment checks.')
  await page.getByLabel('Hindi').check()
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpegWithExif()) })
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile saved')).toBeVisible()

  // The photo comes back from storage, without its EXIF metadata.
  const photo = await page.request.get('/api/v1/worker/profile/photo')
  expect(photo.status()).toBe(200)
  expect(photo.headers()['content-type']).toBe('image/jpeg')
  const bytes = await photo.body()
  expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
  expect(bytes.includes(Buffer.from('Exif'))).toBe(false)
})
