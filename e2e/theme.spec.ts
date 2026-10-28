import { expect, test } from '@playwright/test'
import postgres from 'postgres'
import { expectAccessible, signInAs } from './helpers'

// Dark mode (contrast in the dark palette, the saved Light/Dark choice) and the
// installable app (manifest, icons, service worker, offline page).
const sql = postgres(process.env.DATABASE_URL!, { idle_timeout: 1 })

const one = async <T>(rows: Promise<T[]>) => (await rows)[0]

test.describe('dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
  })

  test('public pages pass the accessibility scan in dark', async ({ page }) => {
    for (const path of ['/', '/services/plumbing', '/in/pune/plumbing', '/login']) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      await expectAccessible(page)
    }
  })

  test('signed-in pages pass the accessibility scan in dark', async ({
    page,
    context,
    baseURL,
  }, info) => {
    test.setTimeout(180_000)
    const tag = `theme-${info.project.name}`
    const priya = await one(
      sql<{ id: string }[]>`select id from users where phone = '+919000000001'`,
    )
    const job = await one(
      sql<
        { id: string }[]
      >`select id from bookings where customer_id = ${priya.id} and status = 'COMPLETED'
        order by created_at desc limit 1`,
    )
    await signInAs(sql, context, baseURL!, priya.id, { tag })
    for (const path of ['/dashboard', `/bookings/${job.id}`, '/profile']) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      await expectAccessible(page)
    }
    const rakesh = await one(
      sql<{ id: string }[]>`select id from users where phone = '+919000000101'`,
    )
    await signInAs(sql, context, baseURL!, rakesh.id, { tag })
    for (const path of ['/worker/dashboard', '/worker/earnings']) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      await expectAccessible(page)
    }
    const admin = await one(
      sql<{ id: string }[]>`select id from users where email = 'admin@kaamico.local'`,
    )
    await signInAs(sql, context, baseURL!, admin.id, { scope: 'ADMIN', tag })
    for (const path of ['/admin', '/admin/analytics']) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      await expectAccessible(page)
    }
  })

  test('a chosen theme is remembered and wins over the device setting', async ({
    page,
    context,
    baseURL,
  }, info) => {
    const priya = await one(
      sql<{ id: string }[]>`select id from users where phone = '+919000000001'`,
    )
    await signInAs(sql, context, baseURL!, priya.id, { tag: `theme-choice-${info.project.name}` })
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

    await page.goto('/profile')
    const appearance = page.getByRole('radiogroup', { name: 'Appearance' })
    await expect(appearance.getByRole('radio', { name: /Same as this device/ })).toBeChecked()
    expect(await background()).toBe('rgb(18, 20, 23)')

    await appearance.getByRole('radio', { name: /^Light/ }).click()
    expect(await background()).toBe('rgb(255, 255, 255)')
    // Applied before the first paint on the next page, not after hydration.
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await background()).toBe('rgb(255, 255, 255)')

    await page.goto('/profile')
    // The stored choice is read after hydration.
    await expect(appearance.getByRole('radio', { name: /^Light/ })).toBeChecked()
    await appearance.getByRole('radio', { name: /Same as this device/ }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme')
    expect(await background()).toBe('rgb(18, 20, 23)')
  })
})

test.describe('installable app', () => {
  test('the manifest and its icons are served', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest')
    expect(res.status()).toBe(200)
    const manifest = await res.json()
    expect(manifest).toMatchObject({ short_name: 'Kaamico', start_url: '/', display: 'standalone' })
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      const image = await request.get(icon.src)
      expect(image.status(), icon.src).toBe(200)
      expect(image.headers()['content-type']).toBe('image/png')
    }
    expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toContain('maskable')
    expect((await request.get('/apple-icon.png')).status()).toBe(200)
  })

  test('the service worker is never cached and the offline page exists', async ({ request }) => {
    const sw = await request.get('/sw.js')
    expect(sw.status()).toBe(200)
    expect(sw.headers()['cache-control']).toContain('no-store')
    expect(sw.headers()['content-type']).toContain('javascript')
    const offline = await request.get('/offline.html')
    expect(await offline.text()).toContain("You're offline")
  })

  test('with no connection, pages show the offline page', async ({ page, context }) => {
    test.skip(
      process.env.E2E_DEV_SERVER === '1',
      'The service worker registers in production builds only',
    )
    await page.goto('/services')
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    // The first load is not controlled yet; the worker claims the page on activation.
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    await context.setOffline(true)
    await page.goto('/services/plumbing').catch(() => undefined)
    await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible()
    await context.setOffline(false)
    await page.getByRole('link', { name: 'Try again' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Plumbing' })).toBeVisible()
  })
})
