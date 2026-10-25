import 'server-only'
import { sql } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'
import { z } from 'zod'
import { getDb } from '@/db/client'
import type { PricingUnit } from './units'

/** Cache tag for categories and services; admin edits (Phase 9) revalidate it. */
export const CATALOG_TAG = 'catalog'

export type CategorySummary = {
  id: string
  slug: string
  name: string
  description: string | null
  iconKey: string
  servicesCount: number
  /** Lowest reference price across the category's services (guidance only). */
  referenceFromPaise: number | null
}

export type ServiceSummary = {
  id: string
  slug: string
  name: string
  description: string | null
  unit: PricingUnit
  typicalDurationMin: number
  referenceMinPaise: number | null
  referenceMaxPaise: number | null
}

export type CategoryDetail = Omit<CategorySummary, 'servicesCount' | 'referenceFromPaise'> & {
  services: ServiceSummary[]
}

export type ServiceDetail = ServiceSummary & {
  category: { id: string; slug: string; name: string; iconKey: string }
}

export type ServiceMatch = {
  serviceId: string
  name: string
  unit: PricingUnit
  category: { slug: string; name: string }
}

const isUuid = (value: string) => z.uuid().safeParse(value).success

type ServiceRow = {
  id: string
  slug: string
  name: string
  description: string | null
  pricing_unit: PricingUnit
  typical_duration_min: number
  reference_min_paise: number | null
  reference_max_paise: number | null
}

const toService = (r: ServiceRow): ServiceSummary => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  description: r.description,
  unit: r.pricing_unit,
  typicalDurationMin: r.typical_duration_min,
  referenceMinPaise: r.reference_min_paise,
  referenceMaxPaise: r.reference_max_paise,
})

/** Active categories with at least one active service, in display order. */
export async function listCategories(): Promise<CategorySummary[]> {
  'use cache'
  cacheLife('minutes')
  cacheTag(CATALOG_TAG)
  const rows = await getDb().execute<{
    id: string
    slug: string
    name: string
    description: string | null
    icon_key: string
    services_count: number
    reference_from_paise: number | null
  }>(sql`
    select c.id, c.slug, c.name, c.description, c.icon_key,
           count(s.id)::int as services_count,
           min(s.reference_min_paise)::int as reference_from_paise
    from service_categories c
    join services s on s.category_id = c.id and s.is_active
    where c.is_active
    group by c.id
    order by c.sort_order, c.name`)
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    iconKey: r.icon_key,
    servicesCount: r.services_count,
    referenceFromPaise: r.reference_from_paise,
  }))
}

export async function getCategoryBySlug(slug: string): Promise<CategoryDetail | null> {
  'use cache'
  cacheLife('minutes')
  cacheTag(CATALOG_TAG)
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null
  const db = getDb()
  const [category] = await db.execute<{
    id: string
    slug: string
    name: string
    description: string | null
    icon_key: string
  }>(sql`
    select id, slug, name, description, icon_key from service_categories
    where slug = ${slug} and is_active`)
  if (!category) return null
  const services = await db.execute<ServiceRow>(sql`
    select id, slug, name, description, pricing_unit, typical_duration_min,
           reference_min_paise, reference_max_paise
    from services where category_id = ${category.id} and is_active
    order by name`)
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    iconKey: category.icon_key,
    services: services.map(toService),
  }
}

/** An active service in an active category, or null. */
export async function getService(id: string): Promise<ServiceDetail | null> {
  'use cache'
  cacheLife('minutes')
  cacheTag(CATALOG_TAG)
  if (!isUuid(id)) return null
  const [row] = await getDb().execute<
    ServiceRow & {
      category_id: string
      category_slug: string
      category_name: string
      icon_key: string
    }
  >(sql`
    select s.id, s.slug, s.name, s.description, s.pricing_unit, s.typical_duration_min,
           s.reference_min_paise, s.reference_max_paise,
           c.id as category_id, c.slug as category_slug, c.name as category_name, c.icon_key
    from services s join service_categories c on c.id = s.category_id
    where s.id = ${id} and s.is_active and c.is_active`)
  if (!row) return null
  return {
    ...toService(row),
    category: {
      id: row.category_id,
      slug: row.category_slug,
      name: row.category_name,
      iconKey: row.icon_key,
    },
  }
}

export const searchQuerySchema = z.string().trim().min(2).max(60)

/** Lower-case word tokens, safe to splice into a tsquery. */
export function queryTokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
    .slice(0, 6)
}

/**
 * Finds services by name, description and synonyms (including Hinglish, e.g. "nal").
 * Full-text with prefix matching first; a substring match as the fallback.
 */
export async function searchServices(q: string, limit = 10): Promise<ServiceMatch[]> {
  'use cache'
  cacheLife('minutes')
  cacheTag(CATALOG_TAG)
  const tokens = queryTokens(q)
  if (tokens.length === 0) return []
  const db = getDb()
  type Row = {
    id: string
    name: string
    pricing_unit: PricingUnit
    category_slug: string
    category_name: string
  }
  const tsquery = tokens.map((t) => `${t}:*`).join(' & ')
  let rows = await db.execute<Row>(sql`
    select s.id, s.name, s.pricing_unit, c.slug as category_slug, c.name as category_name
    from services s join service_categories c on c.id = s.category_id
    where s.is_active and c.is_active
      and s.search_vector @@ to_tsquery('english', ${tsquery})
    order by ts_rank(s.search_vector, to_tsquery('english', ${tsquery})) desc, c.sort_order, s.name
    limit ${limit}`)
  if (rows.length === 0) {
    const patterns = sql.join(
      tokens.map((t) => sql`${`%${t.replace(/[\\%_]/g, '\\$&')}%`}`),
      sql`, `,
    )
    rows = await db.execute<Row>(sql`
      select s.id, s.name, s.pricing_unit, c.slug as category_slug, c.name as category_name
      from services s join service_categories c on c.id = s.category_id
      where s.is_active and c.is_active
        and (s.name || ' ' || s.search_terms || ' ' || c.name) ilike any (array[${patterns}]::text[])
      order by c.sort_order, s.name
      limit ${limit}`)
  }
  return rows.map((r) => ({
    serviceId: r.id,
    name: r.name,
    unit: r.pricing_unit,
    category: { slug: r.category_slug, name: r.category_name },
  }))
}
