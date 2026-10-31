import 'server-only'
import type { Locale } from '@/i18n/config'
import { nearbyPriceRanges, type PriceRange } from '@/modules/matching/repo'
import { getCategoryBySlug, type CategoryDetail, type ServiceSummary } from './catalog'

export type CategoryWithPrices = Omit<CategoryDetail, 'services'> & {
  services: (ServiceSummary & { nearbyPriceRange: Omit<PriceRange, 'serviceId'> | null })[]
}

/**
 * A category with each service's real price range from professionals near the point.
 * Without a point (no location yet) every range is null.
 */
export async function getCategoryWithNearbyPrices(
  slug: string,
  point: { lat: number; lng: number } | null,
  now: Date = new Date(),
  locale: Locale = 'en',
): Promise<CategoryWithPrices | null> {
  const category = await getCategoryBySlug(slug, locale)
  if (!category) return null
  const ranges = point
    ? await nearbyPriceRanges({ categoryId: category.id, ...point, now })
    : new Map<string, PriceRange>()
  return {
    ...category,
    services: category.services.map((s) => {
      const range = ranges.get(s.id)
      return {
        ...s,
        nearbyPriceRange: range
          ? {
              minPaise: range.minPaise,
              medianPaise: range.medianPaise,
              maxPaise: range.maxPaise,
              workerCount: range.workerCount,
            }
          : null,
      }
    }),
  }
}
