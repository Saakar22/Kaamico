import { sql } from 'drizzle-orm'
import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { serviceCategories, services } from './catalog.ts'
import { createdAt, id } from './columns.ts'

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

/**
 * People outside the service cities who asked to hear when Kaamico arrives (§4.2, P2).
 * One entry per contact and city; the location is rounded to about 10 km.
 */
export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: id(),
    /** As typed, for display. */
    city: varchar({ length: 80 }).notNull(),
    /** Lower-case and trimmed, for grouping and de-duplication. */
    cityKey: varchar({ length: 80 }).notNull(),
    /** E.164 mobile or lower-case email. */
    contact: varchar({ length: 120 }).notNull(),
    contactKind: varchar({ length: 8 }).notNull(),
    /** What they need most, if they said. */
    categoryId: uuid().references(() => serviceCategories.id),
    approxLat: doublePrecision(),
    approxLng: doublePrecision(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('waitlist_entries_contact_city').on(t.contact, t.cityKey),
    index('waitlist_entries_city_idx').on(t.cityKey),
    check('waitlist_entries_contact_kind', sql`${t.contactKind} in ('PHONE', 'EMAIL')`),
  ],
)
