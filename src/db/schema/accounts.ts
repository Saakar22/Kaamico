import { sql, type SQL } from 'drizzle-orm'
import {
  boolean,
  char,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { citext, createdAt, id, timestamptz, updatedAt } from './columns.ts'
import { addressLabel, userRole, userStatus } from './enums.ts'

/** Coordinates must fall inside India's bounding box. */
export const inIndia = (lat: AnyPgColumn, lng: AnyPgColumn): SQL =>
  sql`${lat} between 6 and 37 and ${lng} between 68 and 98`

export const users = pgTable(
  'users',
  {
    id: id(),
    /** E.164 Indian mobile, e.g. +919876543210. PII: never shown to the other party. */
    phone: varchar({ length: 13 }).unique(),
    phoneVerifiedAt: timestamptz(),
    email: citext().unique(),
    emailVerified: boolean().notNull().default(false),
    /** Null until onboarding. */
    name: varchar({ length: 80 }),
    roles: userRole()
      .array()
      .notNull()
      .default(sql`'{CUSTOMER}'`),
    status: userStatus().notNull().default('ACTIVE'),
    preferredLocale: varchar({ length: 8 }).notNull().default('en'),
    lastLoginAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamptz(),
  },
  (t) => [
    check('users_contact_present', sql`${t.phone} is not null or ${t.email} is not null`),
    check('users_phone_format', sql`${t.phone} ~ '^\\+91[6-9][0-9]{9}$'`),
    check('users_roles_not_empty', sql`cardinality(${t.roles}) > 0`),
    index('users_roles_idx').using('gin', t.roles),
  ],
)

export const localities = pgTable(
  'localities',
  {
    id: id(),
    city: varchar({ length: 60 }).notNull(),
    name: varchar({ length: 80 }).notNull(),
    pincode: char({ length: 6 }),
    lat: doublePrecision().notNull(),
    lng: doublePrecision().notNull(),
    isServiceable: boolean().notNull().default(true),
  },
  (t) => [
    unique('localities_city_name_key').on(t.city, t.name),
    check('localities_in_india', inIndia(t.lat, t.lng)),
  ],
)

export const addresses = pgTable(
  'addresses',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    label: addressLabel().notNull().default('HOME'),
    line1: varchar({ length: 120 }).notNull(),
    line2: varchar({ length: 120 }),
    landmark: varchar({ length: 120 }),
    localityId: uuid().references(() => localities.id),
    city: varchar({ length: 60 }).notNull(),
    state: varchar({ length: 60 }).notNull(),
    pincode: char({ length: 6 }).notNull(),
    lat: doublePrecision().notNull(),
    lng: doublePrecision().notNull(),
    isDefault: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamptz(),
  },
  (t) => [
    index('addresses_user_idx').on(t.userId),
    uniqueIndex('addresses_one_default_per_user')
      .on(t.userId)
      .where(sql`${t.isDefault} and ${t.deletedAt} is null`),
    check('addresses_pincode_format', sql`${t.pincode} ~ '^[1-9][0-9]{5}$'`),
    check('addresses_in_india', inIndia(t.lat, t.lng)),
  ],
)

export const customerProfiles = pgTable('customer_profiles', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id),
  defaultAddressId: uuid().references(() => addresses.id, { onDelete: 'set null' }),
  bookingsCount: integer().notNull().default(0),
  cancellationsCount: integer().notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
