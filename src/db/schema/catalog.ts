import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { createdAt, id, tsvector, updatedAt } from './columns.ts'
import { pricingUnit } from './enums.ts'

export const serviceCategories = pgTable('service_categories', {
  id: id(),
  slug: varchar({ length: 60 }).notNull().unique(),
  name: varchar({ length: 80 }).notNull(),
  description: varchar({ length: 300 }),
  /** Hindi name and description; screens fall back to English when missing. */
  nameHi: varchar({ length: 80 }),
  descriptionHi: varchar({ length: 300 }),
  /** Lucide icon name or custom icon key. */
  iconKey: varchar({ length: 40 }).notNull(),
  sortOrder: smallint().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const services = pgTable(
  'services',
  {
    id: id(),
    categoryId: uuid()
      .notNull()
      .references(() => serviceCategories.id),
    slug: varchar({ length: 80 }).notNull(),
    name: varchar({ length: 100 }).notNull(),
    description: varchar({ length: 500 }),
    /** Hindi name and description; screens fall back to English when missing. */
    nameHi: varchar({ length: 100 }),
    descriptionHi: varchar({ length: 500 }),
    pricingUnit: pricingUnit().notNull(),
    typicalDurationMin: smallint().notNull(),
    /** Guidance shown to workers and customers; never enforced. */
    referenceMinPaise: integer(),
    referenceMaxPaise: integer(),
    /** Synonyms including Hinglish, e.g. "nal tap leak". */
    searchTerms: text().notNull().default(''),
    searchVector: tsvector().generatedAlwaysAs(
      sql`to_tsvector('english'::regconfig, coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(search_terms, ''))`,
    ),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('services_category_slug_key').on(t.categoryId, t.slug),
    index('services_search_idx').using('gin', t.searchVector),
    index('services_category_idx').on(t.categoryId, t.isActive),
    check('services_duration_positive', sql`${t.typicalDurationMin} between 15 and 1440`),
    check(
      'services_reference_range',
      sql`${t.referenceMinPaise} is null or ${t.referenceMaxPaise} is null or ${t.referenceMinPaise} <= ${t.referenceMaxPaise}`,
    ),
  ],
)
