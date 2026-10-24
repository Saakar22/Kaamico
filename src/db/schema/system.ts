import { sql } from 'drizzle-orm'
import {
  bigint,
  char,
  check,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users } from './accounts.ts'
import { createdAt, id, timestamptz } from './columns.ts'

/** In-app notifications. */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    type: varchar({ length: 60 }).notNull(),
    title: varchar({ length: 120 }).notNull(),
    body: varchar({ length: 500 }),
    link: varchar({ length: 300 }),
    readAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt.desc())],
)

/**
 * Transactional outbox: written in the same transaction as the business change,
 * delivered afterwards by the dispatcher.
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    topic: varchar({ length: 80 }).notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    availableAt: timestamptz().notNull().defaultNow(),
    processedAt: timestamptz(),
    attempts: smallint().notNull().default(0),
    lastError: text(),
  },
  (t) => [
    index('outbox_events_pending_idx')
      .on(t.availableAt)
      .where(sql`${t.processedAt} is null`),
  ],
)

/** Every administrative action and identity-document view. Append-only (enforced by trigger). */
export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    adminUserId: uuid()
      .notNull()
      .references(() => users.id),
    action: varchar({ length: 60 }).notNull(),
    entityType: varchar({ length: 60 }).notNull(),
    entityId: varchar({ length: 64 }).notNull(),
    before: jsonb(),
    after: jsonb(),
    reason: varchar({ length: 500 }),
    ip: inet(),
    userAgent: varchar({ length: 300 }),
    requestId: varchar({ length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [
    index('admin_audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('admin_audit_logs_admin_idx').on(t.adminUserId, t.createdAt),
  ],
)

/** Stored responses for `Idempotency-Key` requests (kept 24 h). */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id),
    key: uuid().notNull(),
    route: varchar({ length: 120 }).notNull(),
    requestHash: char({ length: 64 }).notNull(),
    statusCode: smallint(),
    response: jsonb(),
    createdAt: createdAt(),
    expiresAt: timestamptz().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.key] }),
    index('idempotency_keys_expires_idx').on(t.expiresAt),
  ],
)

/** Fixed-window rate-limit counters (works without Redis). */
export const rateLimits = pgTable('rate_limits', {
  bucket: varchar({ length: 160 }).primaryKey(),
  windowStart: timestamptz().notNull(),
  count: integer().notNull().default(0),
})

/** Private files uploaded before being attached to a document, charge or dispute. */
export const uploads = pgTable(
  'uploads',
  {
    id: id(),
    ownerUserId: uuid()
      .notNull()
      .references(() => users.id),
    storageKey: text().notNull().unique(),
    mimeType: varchar({ length: 60 }).notNull(),
    sizeBytes: integer().notNull(),
    sha256: char({ length: 64 }).notNull(),
    purpose: varchar({ length: 40 }).notNull(),
    attachedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    index('uploads_owner_idx').on(t.ownerUserId, t.createdAt),
    check('uploads_size', sql`${t.sizeBytes} between 1 and 8388608`),
  ],
)
