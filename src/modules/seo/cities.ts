import 'server-only'
import { sql } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'
import { getDb } from '@/db/client'
import { CATALOG_TAG } from '@/modules/catalog/catalog'
import type { PricingUnit } from '@/modules/catalog/units'
import { matchingConfig } from '@/modules/matching/config'
import { PUBLIC_WORKER } from '@/modules/professionals/profile'
import { photoUrl } from '@/modules/uploads/serve'

/**
 * Public, crawlable pages per city (`/in/[city]` and `/in/[city]/[category]`, P1 SEO).
 * Everything here is cached and reads no cookies, so the pages are prerendered and
 * refreshed hourly; catalog edits refresh them at once through the catalog tag.
 */
export const CITY_PAGES_TAG = 'city-pages'

/** "Bengaluru" → "bengaluru", "Navi Mumbai" → "navi-mumbai". */
export function citySlug(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export type CitySummary = {
  slug: string
  name: string
  localities: { id: string; name: string }[]
  /** Verified professionals based in the city. */
  professionals: number
}

export type CityCategory = {
  slug: string
  name: string
  iconKey: string
  description: string | null
  /** Verified professionals in the city offering at least one of its services. */
  professionals: number
  fromPaise: number | null
}

export type CityService = {
  id: string
  slug: string
  name: string
  description: string | null
  unit: PricingUnit
  professionals: number
  /** Middle of the professionals' prices (10th to 90th percentile), so outliers do not mislead. */
  lowPaise: number | null
  highPaise: number | null
  medianPaise: number | null
}

export type CityProfessional = {
  id: string
  displayName: string
  photoUrl: string | null
  locality: string | null
  yearsExperience: number
  ratingAverage: number | null
  ratingCount: number
  completedJobs: number
  fromPaise: number
}

export type CityCategoryPage = {
  city: { slug: string; name: string }
  category: { id: string; slug: string; name: string; iconKey: string; description: string | null }
  services: CityService[]
  professionals: CityProfessional[]
  /** Localities where the category's professionals are based. */
  localities: string[]
}

/** Cities with serviceable localities, largest first. */
export async function listCities(): Promise<CitySummary[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CITY_PAGES_TAG, 'localities')
  const rows = await getDb().execute<{
    city: string
    localities: { id: string; name: string }[]
    professionals: number
  }>(sql`
    select l.city,
      json_agg(json_build_object('id', l.id, 'name', l.name) order by l.name) as localities,
      (select count(*)::int from worker_profiles w join users u on u.id = w.user_id
        join localities wl on wl.id = w.base_locality_id
        where wl.city = l.city and ${PUBLIC_WORKER}) as professionals
    from localities l where l.is_serviceable
    group by l.city
    order by professionals desc, l.city`)
  return rows.map((r) => ({
    slug: citySlug(r.city),
    name: r.city,
    localities: r.localities,
    professionals: r.professionals,
  }))
}

export async function getCity(slug: string): Promise<CitySummary | null> {
  return (await listCities()).find((c) => c.slug === slug) ?? null
}

/** Professionals of the city and the services they offer (shared by both queries). */
const cityOffers = (city: string) => sql`
  select p.worker_id, p.service_id, p.price_paise, s.category_id
  from worker_service_pricing p
  join services s on s.id = p.service_id and s.is_active
  join service_categories c on c.id = s.category_id and c.is_active
  join worker_profiles w on w.id = p.worker_id
  join users u on u.id = w.user_id
  join localities l on l.id = w.base_locality_id
  where p.is_active and l.city = ${city} and ${PUBLIC_WORKER}`

/** Categories with at least one professional in the city, busiest first. */
export async function listCityCategories(citySlugValue: string): Promise<CityCategory[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CITY_PAGES_TAG, CATALOG_TAG)
  const city = await getCity(citySlugValue)
  if (!city) return []
  const rows = await getDb().execute<{
    slug: string
    name: string
    icon_key: string
    description: string | null
    professionals: number
    from_paise: number | null
  }>(sql`
    with o as (${cityOffers(city.name)})
    select c.slug, c.name, c.icon_key, c.description,
      count(distinct o.worker_id)::int as professionals,
      min(o.price_paise)::int as from_paise
    from o join service_categories c on c.id = o.category_id
    group by c.id
    order by professionals desc, c.sort_order, c.name`)
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    iconKey: r.icon_key,
    description: r.description,
    professionals: r.professionals,
    fromPaise: r.from_paise,
  }))
}

/** One category in one city: per-service prices, top professionals and where they are. */
export async function getCityCategory(
  citySlugValue: string,
  categorySlug: string,
): Promise<CityCategoryPage | null> {
  'use cache'
  cacheLife('hours')
  cacheTag(CITY_PAGES_TAG, CATALOG_TAG)
  const city = await getCity(citySlugValue)
  if (!city) return null
  const db = getDb()
  const [category] = await db.execute<{
    id: string
    slug: string
    name: string
    icon_key: string
    description: string | null
  }>(sql`
    select id, slug, name, icon_key, description from service_categories
    where slug = ${categorySlug} and is_active`)
  if (!category) return null

  const { mean, weight } = matchingConfig.ratingPrior
  const [services, professionals, localities] = await Promise.all([
    db.execute<{
      id: string
      slug: string
      name: string
      description: string | null
      pricing_unit: PricingUnit
      professionals: number
      low: number | null
      high: number | null
      median: number | null
    }>(sql`
      with o as (${cityOffers(city.name)})
      select s.id, s.slug, s.name, s.description, s.pricing_unit,
        count(o.worker_id)::int as professionals,
        round(percentile_cont(0.1) within group (order by o.price_paise))::int as low,
        round(percentile_cont(0.9) within group (order by o.price_paise))::int as high,
        round(percentile_cont(0.5) within group (order by o.price_paise))::int as median
      from services s left join o on o.service_id = s.id
      where s.category_id = ${category.id} and s.is_active
      group by s.id
      order by count(o.worker_id) desc, s.name`),
    // Ranked like search: a rating pulled towards the average until there are enough reviews.
    db.execute<{
      id: string
      display_name: string
      photo_key: string | null
      locality: string | null
      years_experience: number
      rating_sum: number
      rating_count: number
      completed_jobs: number
      from_paise: number
    }>(sql`
      with o as (${cityOffers(city.name)})
      select w.id, w.display_name, w.photo_key, l.name as locality, w.years_experience,
        w.rating_sum, w.rating_count, w.completed_jobs, min(o.price_paise)::int as from_paise
      from o
      join worker_profiles w on w.id = o.worker_id
      left join localities l on l.id = w.base_locality_id
      where o.category_id = ${category.id}
      group by w.id, l.name
      order by (${weight}::float8 * ${mean} + w.rating_sum) / (${weight} + w.rating_count) desc,
        w.completed_jobs desc, w.id
      limit 6`),
    db.execute<{ name: string }>(sql`
      with o as (${cityOffers(city.name)})
      select distinct l.name from o
      join worker_profiles w on w.id = o.worker_id
      join localities l on l.id = w.base_locality_id
      where o.category_id = ${category.id}
      order by l.name`),
  ])

  return {
    city: { slug: city.slug, name: city.name },
    category: {
      id: category.id,
      slug: category.slug,
      name: category.name,
      iconKey: category.icon_key,
      description: category.description,
    },
    services: services.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      unit: s.pricing_unit,
      professionals: s.professionals,
      lowPaise: s.low,
      highPaise: s.high,
      medianPaise: s.median,
    })),
    professionals: professionals.map((p) => ({
      id: p.id,
      displayName: p.display_name,
      photoUrl: photoUrl(p.id, p.photo_key),
      locality: p.locality,
      yearsExperience: p.years_experience,
      ratingAverage:
        p.rating_count > 0 ? Math.round((p.rating_sum / p.rating_count) * 10) / 10 : null,
      ratingCount: p.rating_count,
      completedJobs: p.completed_jobs,
      fromPaise: p.from_paise,
    })),
    localities: localities.map((l) => l.name),
  }
}

/** Public professional profiles for the sitemap, most recently updated first. */
export async function listPublicProfessionals(): Promise<{ id: string; updatedAt: string }[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CITY_PAGES_TAG)
  const rows = await getDb().execute<{ id: string; updated_at: Date | string }>(sql`
    select w.id, w.updated_at from worker_profiles w join users u on u.id = w.user_id
    where ${PUBLIC_WORKER}
    order by w.updated_at desc
    limit 5000`)
  return rows.map((r) => ({ id: r.id, updatedAt: new Date(r.updated_at).toISOString() }))
}
