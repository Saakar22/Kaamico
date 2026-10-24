import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const pages = [
  '/',
  '/dev/ui',
  '/dev/shells/customer',
  '/dev/shells/worker',
  '/dev/shells/admin',
  '/no-such-page',
]

for (const path of pages) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path)
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
  await page.goto('/dev/ui')
  await page.getByRole('button', { name: 'Cancel booking…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cancel this booking?' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Cancel booking…' })).toBeFocused()
})

test('bottom tabs show on phones and the top nav on desktop', async ({ page, isMobile }) => {
  await page.goto('/dev/shells/customer')
  const tabs = page
    .getByRole('navigation', { name: 'Main' })
    .filter({ has: page.getByText('Bookings') })
  await expect(tabs.first()).toBeVisible()
  const bottomBar = page.locator('nav.fixed')
  if (isMobile) await expect(bottomBar).toBeVisible()
  else await expect(bottomBar).toBeHidden()
})
