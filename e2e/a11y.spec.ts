import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const pages = [
  '/login',
  '/admin/login',
  '/',
  '/services',
  '/services/plumbing',
  '/search',
  '/search?q=plumber',
  '/dev/ui',
  '/dev/shells/customer',
  '/dev/shells/worker',
  '/dev/shells/admin',
  '/no-such-page',
]

/**
 * Opens a page and checks it really rendered. /dev/* pages exist in `next dev` and in
 * builds made with ENABLE_UI_GALLERY=true (CI); elsewhere they are skipped, not scanned as 404s.
 */
async function open(page: Page, path: string) {
  const response = await page.goto(path)
  const status = response?.status()
  if (path.startsWith('/dev/')) {
    test.skip(
      status === 404 && process.env.ENABLE_UI_GALLERY !== 'true',
      'Developer pages are disabled in this build',
    )
  }
  expect(status).toBe(path === '/no-such-page' ? 404 : 200)
}

for (const path of pages) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await open(page, path)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(
      serious.map(
        (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
      ),
    ).toEqual([])
  })
}

test('the gallery dialog traps focus and closes with Escape', async ({ page }) => {
  await open(page, '/dev/ui')
  await page.getByRole('button', { name: 'Cancel booking…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cancel this booking?' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Cancel booking…' })).toBeFocused()
})

test('bottom tabs show on phones and the top nav on desktop', async ({ page, isMobile }) => {
  await open(page, '/dev/shells/customer')
  const tabs = page
    .getByRole('navigation', { name: 'Main' })
    .filter({ has: page.getByText('Bookings') })
  await expect(tabs.first()).toBeVisible()
  const bottomBar = page.locator('nav.fixed')
  if (isMobile) await expect(bottomBar).toBeVisible()
  else await expect(bottomBar).toBeHidden()
})
