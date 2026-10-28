import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { addresses, inIndia, users } from './accounts.ts'
import { serviceCategories, services } from './catalog.ts'
import { createdAt, id, timestamptz, tstzrange, updatedAt } from './columns.ts'
import {
  actorRole,
  bookingMode,
  bookingStatus,
  bookingTiming,
  chargeKind,
  chargeStatus,
  invitationStatus,
  offerParty,
  offerStatus,
} from './enums.ts'
import { workerProfiles } from './workers.ts'

/** Snapshot of the job address at request time; later address edits never change history. */
export type AddressSnapshot = {
  line1: string
  line2?: string | null
  landmark?: string | null
  locality?: string | null
  city: string
  state: string
  pincode: string
}

/** Statuses in which a worker is assigned and the price is locked. */
const PRICED = sql.raw(`('CONFIRMED','EN_ROUTE','ARRIVED','IN_PROGRESS','COMPLETED','DISPUTED')`)

export const bookings = pgTable(
  'bookings',
  {
    id: id(),
    /** Human-friendly reference, e.g. KMC-7Q4X9P. */
    code: varchar({ length: 12 }).notNull().unique(),
    customerId: uuid()
      .notNull()
      .references(() => users.id),
    serviceId: uuid()
      .notNull()
      .references(() => services.id),
    categoryId: uuid()
      .notNull()
      .references(() => serviceCategories.id),
    /** Null until a worker is confirmed. */
    workerId: uuid().references(() => workerProfiles.id),
    mode: bookingMode().notNull().default('DIRECT'),
    timing: bookingTiming().notNull(),
    status: bookingStatus().notNull().default('REQUESTED'),
    requestedStart: timestamptz().notNull(),
    /** Set at confirmation: start .. start + duration + buffer. Guarded by the no-overlap constraint. */
    slot: tstzrange(),
    addressId: uuid().references(() => addresses.id),
    addressSnapshot: jsonb().$type<AddressSnapshot>().notNull(),
    jobLat: doublePrecision().notNull(),
    jobLng: doublePrecision().notNull(),
    localityLabel: varchar({ length: 120 }).notNull(),
    description: varchar({ length: 1000 }),
    customerInitialOfferPaise: integer(),
    /** Target worker's listed price at request time (DIRECT mode). */
    listedPricePaise: integer(),
    agreedPricePaise: integer(),
    acceptedOfferId: uuid()
      .unique()
      .references((): AnyPgColumn => priceOffers.id),
    approvedChargesPaise: integer().notNull().default(0),
    finalAmountPaise: integer().generatedAlwaysAs(sql`agreed_price_paise + approved_charges_paise`),
    /** Commission snapshot in basis points (1000 = 10%). */
    commissionBps: integer().notNull(),
    startCodeHash: text(),
    startCodeAttempts: smallint().notNull().default(0),
    cancelledBy: actorRole(),
    cancellationReason: varchar({ length: 300 }),
    idempotencyKey: uuid().notNull(),
    /** When an unconfirmed request lapses. */
    expiresAt: timestamptz(),
    confirmedAt: timestamptz(),
    startedAt: timestamptz(),
    completedAt: timestamptz(),
    cancelledAt: timestamptz(),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('bookings_customer_idempotency_key').on(t.customerId, t.idempotencyKey),
    index('bookings_customer_created_idx').on(t.customerId, t.createdAt.desc()),
    index('bookings_worker_status_idx').on(t.workerId, t.status),
    index('bookings_status_expires_idx').on(t.status, t.expiresAt),
    index('bookings_category_status_idx').on(t.categoryId, t.status),
    check('bookings_job_in_india', inIndia(t.jobLat, t.jobLng)),
    check(
      'bookings_amounts_positive',
      sql`coalesce(${t.agreedPricePaise}, 1) > 0 and coalesce(${t.customerInitialOfferPaise}, 1) > 0 and coalesce(${t.listedPricePaise}, 1) > 0 and ${t.approvedChargesPaise} >= 0`,
    ),
    check('bookings_commission_range', sql`${t.commissionBps} between 0 and 5000`),
    check('bookings_start_code_attempts', sql`${t.startCodeAttempts} between 0 and 5`),
    check(
      'bookings_priced_when_confirmed',
      sql`${t.status} not in ${PRICED} or (${t.workerId} is not null and ${t.agreedPricePaise} is not null and ${t.acceptedOfferId} is not null and ${t.slot} is not null and ${t.confirmedAt} is not null)`,
    ),
    check('bookings_completed_at', sql`${t.status} <> 'COMPLETED' or ${t.completedAt} is not null`),
    check(
      'bookings_cancellation_recorded',
      sql`${t.status} <> 'CANCELLED' or (${t.cancelledAt} is not null and ${t.cancelledBy} is not null)`,
    ),
    check('bookings_slot_not_empty', sql`${t.slot} is null or not isempty(${t.slot})`),
  ],
)

/** One row per worker asked to take a booking: the worker's inbox. */
export const bookingInvitations = pgTable(
  'booking_invitations',
  {
    id: id(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    workerId: uuid()
      .notNull()
      .references(() => workerProfiles.id),
    status: invitationStatus().notNull().default('INVITED'),
    /** Straight-line distance at invite time. */
    distanceKm: numeric({ precision: 5, scale: 2, mode: 'number' }).notNull(),
    rankScore: numeric({ precision: 6, scale: 4, mode: 'number' }),
    expiresAt: timestamptz().notNull(),
    seenAt: timestamptz(),
    respondedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('booking_invitations_booking_worker_key').on(t.bookingId, t.workerId),
    index('booking_invitations_worker_idx').on(t.workerId, t.status, t.expiresAt),
    check('booking_invitations_distance', sql`${t.distanceKm} >= 0`),
  ],
)

/** Append-only (enforced by trigger). */
export const bookingStatusHistory = pgTable(
  'booking_status_history',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    fromStatus: bookingStatus(),
    toStatus: bookingStatus().notNull(),
    actorUserId: uuid().references(() => users.id),
    actorRole: actorRole().notNull(),
    reason: varchar({ length: 300 }),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('booking_status_history_booking_idx').on(t.bookingId, t.createdAt)],
)

/**
 * Offers on a negotiation thread (booking × worker). Amount and authorship are
 * immutable and status only moves away from PENDING (enforced by trigger).
 */
export const priceOffers = pgTable(
  'price_offers',
  {
    id: id(),
    bookingId: uuid()
      .notNull()
      .references((): AnyPgColumn => bookings.id),
    invitationId: uuid()
      .notNull()
      .references(() => bookingInvitations.id),
    workerId: uuid()
      .notNull()
      .references(() => workerProfiles.id),
    offeredBy: offerParty().notNull(),
    amountPaise: integer().notNull(),
    note: varchar({ length: 200 }),
    status: offerStatus().notNull().default('PENDING'),
    parentOfferId: uuid().references((): AnyPgColumn => priceOffers.id),
    /** 1-based position in the thread; at most 3 offers per side. */
    round: smallint().notNull(),
    expiresAt: timestamptz().notNull(),
    respondedAt: timestamptz(),
    respondedByUserId: uuid().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('price_offers_one_pending_per_thread')
      .on(t.bookingId, t.workerId)
      .where(sql`${t.status} = 'PENDING'`),
    // The sweeper's "pending offers past their expiry" lookup.
    index('price_offers_pending_expiry_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'PENDING'`),
    uniqueIndex('price_offers_one_accepted_per_booking')
      .on(t.bookingId)
      .where(sql`${t.status} = 'ACCEPTED'`),
    index('price_offers_thread_idx').on(t.bookingId, t.workerId, t.createdAt),
    check('price_offers_amount_positive', sql`${t.amountPaise} > 0`),
    check('price_offers_round', sql`${t.round} between 1 and 6`),
  ],
)

/** Short messages on a negotiation thread. Append-only. */
export const negotiationMessages = pgTable(
  'negotiation_messages',
  {
    id: id(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    workerId: uuid()
      .notNull()
      .references(() => workerProfiles.id),
    senderUserId: uuid()
      .notNull()
      .references(() => users.id),
    body: varchar({ length: 500 }).notNull(),
    offerId: uuid().references(() => priceOffers.id),
    /** True when phone numbers / UPI IDs were masked server-side. */
    redacted: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('negotiation_messages_thread_idx').on(t.bookingId, t.workerId, t.createdAt),
    check('negotiation_messages_body_not_blank', sql`length(trim(${t.body})) > 0`),
  ],
)

/** Extra materials or work proposed after arrival; counts only once the customer approves. */
export const bookingCharges = pgTable(
  'booking_charges',
  {
    id: id(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    proposedByWorkerId: uuid()
      .notNull()
      .references(() => workerProfiles.id),
    kind: chargeKind().notNull(),
    description: varchar({ length: 200 }).notNull(),
    amountPaise: integer().notNull(),
    receiptKey: text(),
    status: chargeStatus().notNull().default('PROPOSED'),
    decidedAt: timestamptz(),
    decidedByUserId: uuid().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('booking_charges_booking_idx').on(t.bookingId),
    // Up to ₹50,000 per charge.
    check('booking_charges_amount', sql`${t.amountPaise} between 1 and 5000000`),
  ],
)
