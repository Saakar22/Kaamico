import { sql } from 'drizzle-orm'
import { char, check, index, inet, pgTable, smallint, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './accounts.ts'
import { createdAt, id, timestamptz } from './columns.ts'
import { sessionScope } from './enums.ts'

/**
 * Opaque server-side sessions. The cookie holds a random token; only its SHA-256
 * is stored, so a database leak does not reveal usable tokens.
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: id(),
    tokenHash: char({ length: 64 }).notNull().unique(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    /** ADMIN sessions come only from the admin login and grant admin powers. */
    scope: sessionScope().notNull(),
    expiresAt: timestamptz().notNull(),
    lastSeenAt: timestamptz().notNull().defaultNow(),
    ip: inet(),
    userAgent: varchar({ length: 300 }),
    createdAt: createdAt(),
  },
  (t) => [
    index('auth_sessions_user_idx').on(t.userId),
    index('auth_sessions_expires_idx').on(t.expiresAt),
  ],
)

/** One-time login codes. Only an HMAC of the code is stored. */
export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: id(),
    phone: varchar({ length: 13 }).notNull(),
    codeHash: char({ length: 64 }).notNull(),
    expiresAt: timestamptz().notNull(),
    attempts: smallint().notNull().default(0),
    consumedAt: timestamptz(),
    ip: inet(),
    createdAt: createdAt(),
  },
  (t) => [
    index('otp_challenges_phone_idx').on(t.phone, t.createdAt.desc()),
    check('otp_challenges_attempts', sql`${t.attempts} between 0 and 5`),
  ],
)
