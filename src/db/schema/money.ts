import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { users } from './accounts.ts'
import { bookings } from './bookings.ts'
import { createdAt, id, timestamptz, updatedAt } from './columns.ts'
import { disputes } from './trust.ts'
import {
  ledgerEntryType,
  paymentProvider,
  paymentStatus,
  payoutMode,
  payoutStatus,
  refundStatus,
} from './enums.ts'
import { workerProfiles } from './workers.ts'

export const payments = pgTable(
  'payments',
  {
    id: id(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    payerUserId: uuid()
      .notNull()
      .references(() => users.id),
    provider: paymentProvider().notNull(),
    /** Always computed on the server from the booking's final amount. */
    amountPaise: integer().notNull(),
    status: paymentStatus().notNull().default('CREATED'),
    providerOrderId: varchar({ length: 80 }).unique(),
    providerPaymentId: varchar({ length: 80 }).unique(),
    idempotencyKey: uuid().notNull(),
    failureReason: varchar({ length: 300 }),
    capturedAt: timestamptz(),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('payments_payer_idempotency_key').on(t.payerUserId, t.idempotencyKey),
    uniqueIndex('payments_one_captured_per_booking')
      .on(t.bookingId)
      .where(sql`${t.status} in ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED')`),
    index('payments_booking_idx').on(t.bookingId),
    check('payments_amount_positive', sql`${t.amountPaise} > 0`),
    check('payments_captured_at', sql`${t.status} <> 'CAPTURED' or ${t.capturedAt} is not null`),
  ],
)

/** The sum of refunds can never exceed the payment amount (enforced by trigger). */
export const refunds = pgTable(
  'refunds',
  {
    id: id(),
    paymentId: uuid()
      .notNull()
      .references(() => payments.id),
    amountPaise: integer().notNull(),
    reason: varchar({ length: 300 }).notNull(),
    status: refundStatus().notNull().default('REQUESTED'),
    providerRefundId: varchar({ length: 80 }).unique(),
    initiatedByAdminId: uuid()
      .notNull()
      .references(() => users.id),
    /** Set when the refund resolves a dispute. */
    disputeId: uuid().references((): AnyPgColumn => disputes.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('refunds_payment_idx').on(t.paymentId),
    check('refunds_amount_positive', sql`${t.amountPaise} > 0`),
  ],
)

/** Gateway webhook inbox, deduplicated by the provider's event id. */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: id(),
    provider: paymentProvider().notNull(),
    providerEventId: varchar({ length: 120 }).notNull(),
    type: varchar({ length: 80 }).notNull(),
    payload: jsonb().notNull(),
    receivedAt: createdAt(),
    processedAt: timestamptz(),
  },
  (t) => [unique('payment_events_provider_event_key').on(t.provider, t.providerEventId)],
)

export type InvoiceLineItem = { label: string; amountPaise: number }

/**
 * Booking receipt (not a GST tax invoice until reviewed by a professional).
 * Immutable after insert (enforced by trigger).
 */
export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    bookingId: uuid()
      .notNull()
      .unique()
      .references(() => bookings.id),
    /** e.g. KMC/2026-27/000123 */
    number: varchar({ length: 24 }).notNull().unique(),
    lineItems: jsonb().$type<InvoiceLineItem[]>().notNull(),
    subtotalPaise: integer().notNull(),
    platformFeePaise: integer().notNull(),
    taxPaise: integer().notNull().default(0),
    totalPaise: integer().notNull(),
    issuedAt: createdAt(),
  },
  (t) => [
    check(
      'invoices_amounts',
      sql`${t.subtotalPaise} >= 0 and ${t.platformFeePaise} >= 0 and ${t.taxPaise} >= 0 and ${t.totalPaise} = ${t.subtotalPaise} + ${t.taxPaise}`,
    ),
  ],
)

export const payouts = pgTable(
  'payouts',
  {
    id: id(),
    workerId: uuid()
      .notNull()
      .references(() => workerProfiles.id),
    amountPaise: integer().notNull(),
    status: payoutStatus().notNull().default('REQUESTED'),
    mode: payoutMode().notNull().default('SIMULATED'),
    reference: varchar({ length: 80 }),
    /** Why a payout failed; its amount went back to the balance. */
    failureReason: varchar({ length: 300 }),
    requestedAt: createdAt(),
    paidAt: timestamptz(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('payouts_worker_idx').on(t.workerId, t.requestedAt),
    // One payout in flight per professional; the next waits until it is paid or fails.
    uniqueIndex('payouts_one_open_per_worker')
      .on(t.workerId)
      .where(sql`${t.status} in ('REQUESTED', 'PROCESSING')`),
    index('payouts_queue_idx').on(t.status, t.requestedAt),
    check('payouts_amount_positive', sql`${t.amountPaise} > 0`),
    check('payouts_paid_at', sql`${t.status} <> 'PAID' or ${t.paidAt} is not null`),
    check('payouts_failure_reason', sql`${t.status} <> 'FAILED' or ${t.failureReason} is not null`),
  ],
)

/**
 * Append-only worker ledger; balance = SUM(amount_paise). Positive means the
 * platform owes the worker; negative means commission is due (cash jobs).
 */
export const workerLedgerEntries = pgTable(
  'worker_ledger_entries',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    workerId: uuid()
      .notNull()
      .references(() => workerProfiles.id),
    bookingId: uuid().references(() => bookings.id),
    payoutId: uuid().references(() => payouts.id),
    type: ledgerEntryType().notNull(),
    /** Signed amount. */
    amountPaise: integer().notNull(),
    description: varchar({ length: 200 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('worker_ledger_entries_worker_idx').on(t.workerId, t.createdAt),
    // A booking's earning, commission and cash entries are posted once.
    uniqueIndex('worker_ledger_entries_once_per_booking')
      .on(t.bookingId, t.type)
      .where(sql`${t.type} in ('JOB_EARNING', 'COMMISSION', 'CASH_COLLECTED')`),
    check('worker_ledger_entries_nonzero', sql`${t.amountPaise} <> 0`),
    check(
      'worker_ledger_entries_sign',
      sql`(${t.type} = 'JOB_EARNING' and ${t.amountPaise} > 0)
        or (${t.type} in ('COMMISSION', 'CASH_COLLECTED', 'REFUND_CLAWBACK', 'PAYOUT') and ${t.amountPaise} < 0)
        or ${t.type} = 'ADJUSTMENT'`,
    ),
    check(
      'worker_ledger_entries_booking_required',
      sql`${t.type} not in ('JOB_EARNING', 'COMMISSION', 'CASH_COLLECTED') or ${t.bookingId} is not null`,
    ),
  ],
)
