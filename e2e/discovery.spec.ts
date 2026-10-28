import { expect, test, type Page } from '@playwright/test'
import { expectAccessible } from './helpers'

// Uses the seeded catalog and professionals (npm run db:seed). No sign-in is needed to browse.

async function chooseLocality(page: Page, city: string, area: string) {
  await page.getByRole('button', { name: /^Location:/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Where do you need help?' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: city, exact: true }).click()
  await sheet.getByRole('button', { name: new RegExp(`^${area}\\b`) }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('button', { name: `Location: ${area}, ${city}` })).toBeVisible()
}

/** Pages behind a location are scanned here; e2e/a11y.spec.ts covers the rest. */

const rupees = (text: string | null) => Number((text ?? '').replace(/[^\d.]/g, '').split('.')[0])

test.describe('discovery', () => {
  test('a customer in Pune finds, compares and opens a professional', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Location: Set your location' })).toBeVisible()
    await chooseLocality(page, 'Pune', 'Kothrud')

    await page.getByRole('searchbox').fill('plumber')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Services for “plumber”')
    await page.getByRole('link', { name: /Tap repair/ }).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tap repair or replacement')
    const results = page.getByRole('list', { name: 'Professionals' }).getByRole('article')
    await expect(results.first()).toBeVisible()
    expect(await results.count()).toBeGreaterThanOrEqual(2)
    await expect(results.first().getByText('ID verified')).toBeVisible()
    await expect(results.first().getByText(/km away/)).toBeVisible()

    await page.getByRole('link', { name: 'Price', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Price', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    const prices = (await page.getByTestId('pro-price').allTextContents()).map(rupees)
    expect(prices.length).toBeGreaterThanOrEqual(2)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
    await expectAccessible(page)

    const name = await results.first().getByRole('heading', { level: 2 }).textContent()
    await results.first().getByRole('link').first().click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name!)
    await expect(page.getByText('ID verified').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Services and prices' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Reviews' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Request booking' })).toHaveAttribute(
      'href',
      /^\/book\/[\w-]+\?worker=/,
    )
    await expect(page.getByRole('heading', { name: 'Upcoming free times' })).toBeVisible()
    await expectAccessible(page)
  })

  test('a customer in Bengaluru sees real nearby price ranges and professionals', async ({
    page,
  }) => {
    await page.goto('/services/appliance-repair')
    await expect(
      page.getByText('Set your location to see real prices from professionals near you.'),
    ).toBeVisible()
    await chooseLocality(page, 'Bengaluru', 'Indiranagar')
    await expect(
      page.getByText('Prices from professionals who travel to Indiranagar, Bengaluru'),
    ).toBeVisible()
    await expect(page.getByText(/^Nearby pros:/).first()).toBeVisible()

    await page.getByRole('link', { name: 'See professionals for AC service' }).click()
    const results = page.getByRole('list', { name: 'Professionals' }).getByRole('article')
    await expect(results.first()).toBeVisible()
    expect(await results.count()).toBeGreaterThanOrEqual(2)
  })

  test('search asks for a location before listing professionals', async ({ page }) => {
    await page.goto('/search?q=nal')
    await page.getByRole('link', { name: /Tap repair/ }).click()
    await expect(page.getByRole('heading', { name: 'Where do you need help?' })).toBeVisible()
    await page.getByRole('main').getByRole('button', { name: 'Set your location' }).click()
    await expect(page.getByRole('dialog', { name: 'Where do you need help?' })).toBeVisible()
  })

  test('city pages lead from a city to local prices and a professional', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /^Pune/ }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Home services in Pune' }),
    ).toBeVisible()
    await expectAccessible(page)
    await page.getByRole('link', { name: /^Plumbing in Pune/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Plumbing in Pune' })).toBeVisible()
    await expect(page).toHaveTitle(/Plumbing in Pune/)
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      /\/in\/pune\/plumbing$/,
    )
    // Structured data for search engines: breadcrumbs and the services with their prices.
    // Reload: after client navigation the previous page stays mounted (hidden).
    await page.reload()
    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(jsonLd.map((t) => JSON.parse(t)['@type'])).toEqual(['BreadcrumbList', 'ItemList'])
    await expectAccessible(page)

    const pros = page.getByRole('region', { name: /Top-rated plumbing professionals/ })
    await pros.getByRole('link').first().click()
    await expect(page).toHaveURL(/\/professionals\/[\w-]+$/)
  })

  test('robots.txt and the sitemap point crawlers at the public pages', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toContain('Disallow: /admin')
    expect(robots).toMatch(/Sitemap: .+\/sitemap\.xml/)
    const sitemap = await (await request.get('/sitemap.xml')).text()
    expect(sitemap).toContain('/in/pune/plumbing</loc>')
    expect(sitemap).toContain('/professionals/')
  })

  test('unknown professionals and categories show the not-found page', async ({ page }) => {
    await page.goto('/professionals/00000000-0000-7000-8000-000000000000')
    await expect(page.getByRole('heading', { name: "We couldn't find that page" })).toBeVisible()
    await page.goto('/services/no-such-category')
    await expect(page.getByRole('heading', { name: "We couldn't find that page" })).toBeVisible()
    await page.goto('/in/atlantis')
    await expect(page.getByRole('heading', { name: "We couldn't find that page" })).toBeVisible()
    await page.goto('/in/pune/no-such-category')
    await expect(page.getByRole('heading', { name: "We couldn't find that page" })).toBeVisible()
  })
})
