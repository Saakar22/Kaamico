import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { inIndia, localities, users } from './accounts.ts'
import { serviceCategories, services } from './catalog.ts'
import { createdAt, id, timestamptz, tstzrange, updatedAt } from './columns.ts'
import { pricingUnit, workerVerificationStatus } from './enums.ts'

export const workerProfiles = pgTable(
  'worker_profiles',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .unique()
      .references(() => users.id),
    displayName: varchar({ length: 60 }).notNull(),
    bio: varchar({ length: 600 }),
    photoKey: text(),
    yearsExperience: smallint().notNull().default(0),
    languages: varchar({ length: 8 })
      .array()
      .notNull()
      .default(sql`'{}'`),
    verificationStatus: workerVerificationStatus().notNull().default('UNVERIFIED'),
    isOnline: boolean().notNull().default(false),
    onlineSince: timestamptz(),
    pausedUntil: timestamptz(),
    /** Private: used only to compute distance, never returned by APIs. */
    baseLat: doublePrecision(),
    baseLng: doublePrecision(),
    baseLocalityId: uuid().references(() => localities.id),
    serviceRadiusKm: numeric({ precision: 4, scale: 1, mode: 'number' }).notNull().default(5),
    ratingSum: integer().notNull().default(0),
    ratingCount: integer().notNull().default(0),
    completedJobs: integer().notNull().default(0),
    acceptedInvitations: integer().notNull().default(0),
    totalInvitations: integer().notNull().default(0),
    cancellationsByWorker: integer().notNull().default(0),
    lastActiveAt: timestamptz(),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('worker_profiles_radius', sql`${t.serviceRadiusKm} between 1 and 25`),
    check(
      'worker_profiles_base_in_india',
      sql`(${t.baseLat} is null and ${t.baseLng} is null) or (${inIndia(t.baseLat, t.baseLng)})`,
    ),
    check('worker_profiles_experience', sql`${t.yearsExperience} between 0 and 60`),
    check(
      'worker_profiles_counters',
      sql`${t.ratingSum} >= 0 and ${t.ratingCount} >= 0 and ${t.completedJobs} >= 0 and ${t.ratingSum} <= ${t.ratingCount} * 5`,
    ),
    index('worker_profiles_status_online_idx').on(t.verificationStatus, t.isOnline),
    index('worker_profiles_base_idx').on(t.baseLat, t.baseLng),
  ],
)

export const workerSkills = pgTable(
  'worker_skills',
  {
    workerId: uuid()
      .notNull()
      .references(() => workerProfiles.id, { onDelete: 'cascade' }),
    categoryId: uuid()
      .notNull()
      .references(() => serviceCategories.id),
    yearsExperience: smallint(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workerId, t.categoryId] }),
    index('worker_skills_category_idx').on(t.categoryId),
  ],
)

export const workerServicePricing = pgTable(
  'worker_service_pricing',
  {
    id: id(),
    workerId: uuid()
      .notNull()
      .references(() => workerProfiles.id, { onDelete: 'cascade' }),
    serviceId: uuid()
      .notNull()
      .references(() => services.id),
    pricePaise: integer().notNull(),
    minChargePaise: integer().notNull(),
    unit: pricingUnit().notNull(),
    isNegotiable: boolean().notNull().default(true),
    isActive: boolean().notNull().default(true),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('worker_service_pricing_worker_service_key').on(t.workerId, t.serviceId),
    index('worker_service_pricing_service_idx').on(t.serviceId, t.isActive),
    // ₹50 to ₹1,00,000.
    check('worker_service_pricing_price_range', sql`${t.pricePaise} between 5000 and 10000000`),
    check(
      'worker_service_pricing_min_charge',
      sql`${t.minChargePaise} >= 0 and ${t.minChargePaise} <= ${t.pricePaise} * 3`,
    ),
  ],
)

/** Weekly working hours in IST. Overlaps are prevented by an exclusion constraint (SQL migration). */
export const workerAvailabilityRules = pgTable(
  'worker_availability_rules',
  {
    id: id(),
    workerId: uuid()
      .notNull()
      .references(() => workerProfiles.id, { onDelete: 'cascade' }),
    /** 0 = Monday … 6 = Sunday. */
    weekday: smallint().notNull(),
    startMinute: smallint().notNull(),
    endMinute: smallint().notNull(),
  },
  (t) => [
    index('worker_availability_rules_worker_idx').on(t.workerId, t.weekday),
    check('worker_availability_rules_weekday', sql`${t.weekday} between 0 and 6`),
    check(
      'worker_availability_rules_window',
      sql`${t.startMinute} >= 0 and ${t.startMinute} < ${t.endMinute} and ${t.endMinute} <= 1440`,
    ),
  ],
)

export const workerTimeOff = pgTable(
  'worker_time_off',
  {
    id: id(),
    workerId: uuid()
      .notNull()
      .references(() => workerProfiles.id, { onDelete: 'cascade' }),
    period: tstzrange().notNull(),
    reason: varchar({ length: 120 }),
    createdAt: createdAt(),
  },
  (t) => [
    index('worker_time_off_period_idx').using('gist', t.workerId, t.period),
    check('worker_time_off_not_empty', sql`not isempty(${t.period})`),
  ],
)

export const favorites = pgTable(
  'favorites',
  {
    customerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workerId: uuid()
      .notNull()
      .references(() => workerProfiles.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.customerId, t.workerId] })],
)
