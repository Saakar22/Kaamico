import { expect, test, type Page } from '@playwright/test'

// Uses the seeded demo accounts (npm run db:seed). Codes are simulated and shown on screen.
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'kaamico-admin-dev'

async function signInWithPhone(page: Page, phone: string) {
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByRole('button', { name: 'Send code' }).click()
  const code = await page.getByTestId('simulated-otp').textContent()
  await page.getByLabel('6-digit code').fill(code!.trim())
  await page.getByRole('button', { name: 'Verify and continue' }).click()
}

const randomMobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`

/**
 * Projects run in parallel and only the latest code for a number is valid, so each
 * project signs in with different seeded accounts (customers 1–3 vs 4–6, two workers).
 */
function accounts(projectName: string) {
  const mobile = projectName === 'mobile'
  return {
    customers: mobile
      ? ['9000000004', '9000000005', '9000000006']
      : ['9000000001', '9000000002', '9000000003'],
    customerName: mobile ? 'Rahul Menon' : 'Priya Sharma',
    worker: mobile ? '9000000102' : '9000000101',
  }
}

test.describe('customer and worker sign-in', () => {
  test('a seeded customer signs in with a simulated OTP', async ({ page }, info) => {
    const { customers, customerName } = accounts(info.project.name)
    await page.goto('/login')
    // Spaces are fine: the number is normalised on the server.
    await signInWithPhone(page, `${customers[0].slice(0, 5)} ${customers[0].slice(5)}`)
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Hi, ${customerName}`)
  })

  test('a new user signs up as a professional', async ({ page }) => {
    await page.goto('/login')
    await signInWithPhone(page, randomMobile())
    await expect(page.getByRole('heading', { name: 'Welcome to Kaamico' })).toBeVisible()
    await page.getByLabel(/Your name/).fill('Imran Shaikh')
    await page.getByText('Offer my services').click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/worker\/dashboard$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hi, Imran Shaikh')
  })

  test('protected pages send visitors to sign in and back again', async ({ page }, info) => {
    await page.goto('/worker/dashboard')
    await expect(page).toHaveURL(/\/login\?next=%2Fworker%2Fdashboard$/)
    await signInWithPhone(page, accounts(info.project.name).worker)
    await expect(page).toHaveURL(/\/worker\/dashboard$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Hi, \w+/)
  })

  test('a customer cannot open the worker or admin areas', async ({ page }, info) => {
    await page.goto('/login')
    await signInWithPhone(page, accounts(info.project.name).customers[1])
    await expect(page).toHaveURL(/\/dashboard$/)

    await page.goto('/worker/dashboard')
    await expect(page.getByText('This area is for professionals')).toBeVisible()
    await page.goto('/admin')
    await expect(page.getByText('This area is for Kaamico admins')).toBeVisible()
  })

  test('signing out ends the session', async ({ page }, info) => {
    await page.goto('/login')
    await signInWithPhone(page, accounts(info.project.name).customers[2])
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/)
  })

  test('shows a helpful error for an invalid number', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Mobile number').fill('12345')
    await page.getByRole('button', { name: 'Send code' }).click()
    await expect(page.getByText('Enter a valid 10-digit Indian mobile number')).toBeVisible()
  })
})

test.describe('admin sign-in', () => {
  test('rejects a wrong password, then signs in', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin$/)

    await page.getByLabel('Email').fill('admin@kaamico.local')
    await page.getByLabel('Password').fill('not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Email or password is incorrect.')).toBeVisible()

    await page.getByLabel('Password').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Admin overview')
  })
})
