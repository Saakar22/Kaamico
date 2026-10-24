import { expect, test } from '@playwright/test'

test('home page renders the brand', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Kaamico/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Local Skills. Fair Prices.')
})

test('health endpoint reports database status', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.headers()['x-request-id']).toBeTruthy()
  const body = await res.json()
  // CI provisions Postgres, so the database must be up there.
  if (process.env.CI) expect(res.status()).toBe(200)
  expect(['up', 'down']).toContain(body.db.status)
})
