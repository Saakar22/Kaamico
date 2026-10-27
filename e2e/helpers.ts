import { createHash, randomBytes } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, type BrowserContext, type Page } from '@playwright/test'
import type postgres from 'postgres'

/** No serious or critical WCAG 2.2 AA violations on the page as it is now. */
export async function expectAccessible(page: Page) {
  // Mid-animation opacity (dialogs popping in, toasts sliding in) reads as low contrast.
  // Infinite ones (spinners, pulses) never finish, so wait only for those that end. A toast
  // can start its transition a frame after the last one ends, so check again until calm.
  await page.evaluate(async () => {
    for (let round = 0; round < 5; round++) {
      const running = document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
      if (running.length === 0) return
      await Promise.all(running.map((a) => a.finished.catch(() => undefined)))
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    }
  })
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    // Toasts that are sliding in or out, hidden, or stacked behind the front one are faded
    // on purpose; the settled front toast is still checked.
    .exclude('[data-sonner-toast][data-mounted="false"]')
    .exclude('[data-sonner-toast][data-removed="true"]')
    .exclude('[data-sonner-toast][data-visible="false"]')
    .exclude('[data-sonner-toast][data-front="false"]')
    .analyze()
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  )
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

/**
 * Signs `context` in as a user by writing a session straight into the database, so tests
 * never race the OTP-based specs for the same phone numbers. `tag` is stored as the user
 * agent so a spec can delete its sessions afterwards.
 */
export async function signInAs(
  sql: postgres.Sql,
  context: BrowserContext,
  baseURL: string,
  userId: string,
  { scope = 'USER', tag }: { scope?: 'USER' | 'ADMIN'; tag: string },
) {
  const token = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(token).digest('hex')
  await sql`insert into auth_sessions (token_hash, user_id, scope, expires_at, user_agent)
    values (${hash}, ${userId}, ${scope}, now() + interval '1 hour', ${tag})`
  await context.clearCookies()
  await context.addCookies([{ name: 'kmc_session', value: token, url: baseURL }])
  return token
}
