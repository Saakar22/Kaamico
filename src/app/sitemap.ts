import type { MetadataRoute } from 'next'
import { getEnv } from '@/config/env'
import { listCategories } from '@/modules/catalog/catalog'
import { listCities, listCityCategories, listPublicProfessionals } from '@/modules/seo/cities'

/** Public pages for search engines: catalog, city pages and professional profiles. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getEnv().APP_URL
  const [categories, cities, professionals] = await Promise.all([
    listCategories(),
    listCities(),
    listPublicProfessionals(),
  ])
  const cityCategories = await Promise.all(
    cities.map(async (city) =>
      (await listCityCategories(city.slug)).map((c) => `/in/${city.slug}/${c.slug}`),
    ),
  )
  const page = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: `${base}${path}`,
    changeFrequency: 'daily',
    priority,
  })
  return [
    page('/', 1),
    page('/services', 0.8),
    ...categories.map((c) => page(`/services/${c.slug}`, 0.7)),
    ...cities.map((c) => page(`/in/${c.slug}`, 0.9)),
    ...cityCategories.flat().map((path) => page(path, 0.8)),
    ...professionals.map((p) => ({
      url: `${base}/professionals/${p.id}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
    page('/terms', 0.1),
    page('/privacy', 0.1),
  ]
}
