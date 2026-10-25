import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { jpegWithExif, tinyPdf } from '../src/test/files'

// A brand-new professional sets up their profile and sends their ID for review.

async function signUpAsProfessional(page: Page, name: string) {
  const mobile = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(mobile)
  await page.getByRole('button', { name: 'Send code' }).click()
  const code = await page.getByTestId('simulated-otp').textContent()
  await page.getByLabel('6-digit code').fill(code!.trim())
  await page.getByRole('button', { name: 'Verify and continue' }).click()
  await page.getByLabel(/Your name/).fill(name)
  await page.getByText('Offer my services').click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/worker\/dashboard$/)
}

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  )
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

const file = (name: string, mimeType: string, bytes: Uint8Array) => ({
  name,
  mimeType,
  buffer: Buffer.from(bytes),
})

test('a new professional completes setup and submits their ID for review', async ({ page }) => {
  test.slow()
  await signUpAsProfessional(page, 'Sunil Gaikwad')
  await expect(page.getByText('0 of 6 setup steps done.')).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Online' })).toBeDisabled()
  await expectNoSeriousA11yViolations(page)

  // 1–2. Profile and skills
  await page.getByRole('link', { name: /Continue: Your profile/ }).click()
  await page.getByLabel(/About you/).fill('Plumber for 7 years. I fix leaks and fit taps neatly.')
  await page.getByLabel(/Years of experience/).fill('7')
  await page.getByLabel('Marathi').check()
  await page.getByLabel('Hindi').check()
  await page.locator('input[type=file]').setInputFiles(file('me.jpg', 'image/jpeg', jpegWithExif()))
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile saved')).toBeVisible()
  await page.getByText('Plumbing', { exact: true }).click()
  await page.getByRole('button', { name: 'Save skills' }).click()
  await expect(page.getByText('Skills saved')).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  // 3 and 5. Work area and hours
  await page.goto('/worker/availability')
  await page.getByLabel(/Your base area/).selectOption({ label: 'Kothrud' })
  await page.getByRole('button', { name: 'Save work area' }).click()
  await expect(page.getByText('Work area saved')).toBeVisible()
  await page.getByRole('button', { name: 'Add hours on Monday' }).click()
  await page.getByRole('button', { name: 'Copy Monday to Tue–Sat' }).click()
  await page.getByRole('button', { name: 'Save working hours' }).click()
  await expect(page.getByText('Working hours saved')).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  // 4. Prices
  await page.goto('/worker/pricing')
  const tap = page.getByRole('group', { name: 'Tap repair or replacement' })
  await tap.getByLabel(/Your price/).fill('250')
  await tap.getByLabel('Minimum charge').fill('150')
  await tap.getByRole('switch').click()
  await page.getByRole('button', { name: 'Save prices' }).click()
  await expect(page.getByText('Prices saved')).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  // 6. ID verification
  await page.goto('/worker/verification')
  await expect(page.getByText('Not verified yet')).toBeVisible()
  await page.getByLabel(/Last 4 characters/).fill('4821')
  await page
    .getByLabel(/Photo or PDF/)
    .setInputFiles(file('aadhaar.pdf', 'application/pdf', tinyPdf()))
  await page.getByRole('button', { name: 'Upload document' }).click()
  await expect(page.getByText('Masked Aadhaar ending 4821')).toBeVisible()

  await page.getByLabel('Document type').selectOption('SELFIE')
  await page
    .getByLabel('Selfie photo')
    .setInputFiles(file('selfie.jpg', 'image/jpeg', jpegWithExif()))
  await page.getByRole('button', { name: 'Upload document' }).click()
  const documents = page.locator('section', {
    has: page.getByRole('heading', { name: 'Your documents' }),
  })
  await expect(documents.getByText('Selfie', { exact: true })).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await page.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByText('Under review')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Upload document' })).toHaveCount(0)

  await page.goto('/worker/dashboard')
  await expect(page.getByText('Your requests and jobs at a glance.')).toBeVisible()
  await expect(page.getByText('Under review')).toBeVisible()
})

test('a spoofed file is rejected with a clear message', async ({ page }) => {
  await signUpAsProfessional(page, 'Kiran More')
  await page.goto('/worker/verification')
  await page.getByLabel('Document type').selectOption('SELFIE')
  await page
    .getByLabel('Selfie photo')
    .setInputFiles(
      file('selfie.jpg', 'image/jpeg', new TextEncoder().encode('<html>not a photo</html>')),
    )
  await page.getByRole('button', { name: 'Upload document' }).click()
  await expect(page.getByText('Upload a JPEG, PNG or WebP photo, or a PDF')).toBeVisible()
})
