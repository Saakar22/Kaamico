import 'server-only'
import { sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { searchDailyCounts } from '@/db/schema'
import { logger } from '@/lib/logger'
import { istDateKey } from '@/lib/time'

/**
 * Counts one search for the admin funnel. Never fails the search: a lost count is
 * better than a customer seeing an error.
 */
export async function countSearch(serviceId: string, empty: boolean, now: Date): Promise<void> {
  try {
    await getDb()
      .insert(searchDailyCounts)
      .values({ day: istDateKey(now), serviceId, searches: 1, emptyResults: empty ? 1 : 0 })
      .onConflictDoUpdate({
        target: [searchDailyCounts.day, searchDailyCounts.serviceId],
        set: {
          searches: sql`${searchDailyCounts.searches} + 1`,
          emptyResults: sql`${searchDailyCounts.emptyResults} + ${empty ? 1 : 0}`,
        },
      })
  } catch (error) {
    logger.warn({ err: error, serviceId }, 'could not count a search')
  }
}
