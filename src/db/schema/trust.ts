import { sql } from 'drizzle-orm'
import {
  bigint,
  char,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users } from './accounts.ts'
import { bookings } from './bookings.ts'
import { createdAt, id, timestamptz, updatedAt } from './columns.ts'
import {
  actorRole,
  bookingStatus,
  disputeOutcome,
  disputeReason,
  disputeStatus,
  reviewStatus,
  ticketStatus,
  verificationApplicationStatus,
  verificationDocumentType,
} from './enums.ts'
import { workerProfiles } from './workers.ts'

/** One review per completed booking, within 14 days of completion (eligibility enforced by trigger). */
export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    bookingId: uuid()
      .notNull()
      .unique()
      .references(() => bookings.id),
    customerId: uuid()
      .notNull()
      .references(() => users.id),
    workerId: uuid()
      .notNull()
      .references(() => workerProfiles.id),
    rating: smallint().notNull(),
    tags: varchar({ length: 24 })
      .array()
      .notNull()
      .default(sql`'{}'`),
    comment: varchar({ length: 1000 }),
    status: reviewStatus().notNull().default('PUBLISHED'),
    workerReply: varchar({ length: 500 }),
    replyAt: timestamptz(),
    hiddenReason: varchar({ length: 300 }),
    /** Set when the professional or the customer reports the review (it stays visible). */
    flagReason: varchar({ length: 300 }),
    flaggedAt: timestamptz(),
    flaggedByUserId: uuid().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('reviews_worker_idx').on(t.workerId, t.status, t.createdAt),
    check('reviews_rating_range', sql`${t.rating} between 1 and 5`),
  ],
)

export const verificationApplications = pgTable(
  'verification_applications',
  {
    id: id(),
    workerId: uuid()
      .notNull()
      .references(() => workerProfiles.id),
    attempt: smallint().notNull().default(1),
    status: verificationApplicationStatus().notNull().default('DRAFT'),
    submittedAt: timestamptz(),
    reviewerAdminId: uuid().references(() => users.id),
    reviewedAt: timestamptz(),
    decisionReason: varchar({ length: 500 }),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('verification_applications_one_open_per_worker')
      .on(t.workerId)
      .where(sql`${t.status} in ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RESUBMISSION_REQUESTED')`),
    index('verification_applications_queue_idx').on(t.status, t.submittedAt),
    // Public profiles read each worker's approval date; admins read their earlier attempts.
    index('verification_applications_worker_idx').on(t.workerId, t.status),
    check(
      'verification_applications_reason_required',
      sql`${t.status} not in ('REJECTED', 'RESUBMISSION_REQUESTED') or length(coalesce(${t.decisionReason}, '')) >= 10`,
    ),
  ],
)

/**
 * Identity documents. Highest sensitivity: never returned by ordinary APIs; admins
 * view them through short-lived signed URLs with every view audited.
 * Full Aadhaar numbers are never stored (only the last 4 digits).
 */
export const verificationDocuments = pgTable(
  'verification_documents',
  {
    id: id(),
    applicationId: uuid()
      .notNull()
      .references(() => verificationApplications.id),
    docType: verificationDocumentType().notNull(),
    idLast4: char({ length: 4 }),
    storageKey: text().notNull(),
    mimeType: varchar({ length: 60 }).notNull(),
    sizeBytes: integer().notNull(),
    sha256: char({ length: 64 }).notNull(),
    uploadedAt: createdAt(),
    /** Files are purged after this date; metadata and the decision are kept. */
    purgeAfter: timestamptz(),
    purgedAt: timestamptz(),
  },
  (t) => [
    index('verification_documents_application_idx').on(t.applicationId),
    check(
      'verification_documents_last4',
      sql`${t.idLast4} is null or ${t.idLast4} ~ '^[0-9A-Z]{4}$'`,
    ),
    check('verification_documents_size', sql`${t.sizeBytes} between 1 and 8388608`),
  ],
)

export const disputes = pgTable(
  'disputes',
  {
    id: id(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    raisedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    raisedByRole: actorRole().notNull(),
    reason: disputeReason().notNull(),
    description: varchar({ length: 2000 }).notNull(),
    status: disputeStatus().notNull().default('OPEN'),
    outcome: disputeOutcome(),
    resolutionNote: varchar({ length: 2000 }),
    resolvedByAdminId: uuid().references(() => users.id),
    resolvedAt: timestamptz(),
    /** Booking status before it moved to DISPUTED, restored or replaced on resolution. */
    previousBookingStatus: bookingStatus().notNull(),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('disputes_one_open_per_booking')
      .on(t.bookingId)
      .where(sql`${t.status} in ('OPEN', 'UNDER_REVIEW')`),
    index('disputes_queue_idx').on(t.status, t.createdAt),
    check(
      'disputes_resolution_recorded',
      sql`${t.status} not in ('RESOLVED', 'REJECTED') or (${t.resolvedByAdminId} is not null and ${t.resolvedAt} is not null and ${t.resolutionNote} is not null)`,
    ),
  ],
)

export const disputeEvidence = pgTable(
  'dispute_evidence',
  {
    id: id(),
    disputeId: uuid()
      .notNull()
      .references(() => disputes.id),
    uploadedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    storageKey: text(),
    note: varchar({ length: 1000 }),
    createdAt: createdAt(),
  },
  (t) => [
    index('dispute_evidence_dispute_idx').on(t.disputeId),
    check('dispute_evidence_content', sql`${t.storageKey} is not null or ${t.note} is not null`),
  ],
)

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    bookingId: uuid().references(() => bookings.id),
    category: varchar({ length: 40 }).notNull(),
    subject: varchar({ length: 150 }).notNull(),
    status: ticketStatus().notNull().default('OPEN'),
    assignedAdminId: uuid().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('support_tickets_user_idx').on(t.userId, t.createdAt),
    index('support_tickets_queue_idx').on(t.status, t.createdAt),
  ],
)

export const ticketMessages = pgTable(
  'ticket_messages',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    ticketId: uuid()
      .notNull()
      .references(() => supportTickets.id),
    senderUserId: uuid()
      .notNull()
      .references(() => users.id),
    body: varchar({ length: 4000 }).notNull(),
    attachmentKey: text(),
    createdAt: createdAt(),
  },
  (t) => [index('ticket_messages_ticket_idx').on(t.ticketId, t.createdAt)],
)
