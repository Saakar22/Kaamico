import { sql } from 'drizzle-orm'
import { check, date, integer, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core'
import { services } from './catalog.ts'

/**
 * Searches per IST day and service, for the admin funnel (§5 `/admin/analytics`). Counts
 * only: nothing about who searched or where is kept.
 */
export const searchDailyCounts = pgTable(
  'search_daily_counts',
  {
    day: date().notNull(),
    serviceId: uuid()
      .notNull()
      .references(() => services.id),
    searches: integer().notNull().default(0),
    /** Searches that found nobody, even after widening the radius. */
    emptyResults: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.serviceId] }),
    check('search_daily_counts_valid', sql`${t.emptyResults} between 0 and ${t.searches}`),
  ],
)
