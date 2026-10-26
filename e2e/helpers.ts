import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/** No serious or critical WCAG 2.2 AA violations on the page as it is now. */
export async function expectAccessible(page: Page) {
  // Mid-animation opacity (dialogs popping in, toasts sliding in) reads as low contrast.
  // Infinite ones (spinners, pulses) never finish, so wait only for those that end.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
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
