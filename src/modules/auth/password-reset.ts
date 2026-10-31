import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { getEnv } from '@/config/env'
import { getDb } from '@/db/client'
import { authSessions, passwordResets, users } from '@/db/schema'
import { businessRule } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { enforceRateLimit, type RateLimitRule } from '@/lib/rate-limit'
import { writeAudit, type AuditContext } from '@/modules/audit/audit'
import { sendEmail } from '@/modules/notifications/email'
import { hashPassword } from './password'
import { generateSessionToken, sha256Hex } from './tokens'

/** Admin password reset by emailed link (§5.3 `/admin/forgot-password`). */

export const RESET_TTL_MINUTES = 30
export const MIN_PASSWORD_LENGTH = 12
const PER_EMAIL: RateLimitRule = { limit: 3, windowSeconds: 3600 }
const PER_IP: RateLimitRule = { limit: 10, windowSeconds: 3600 }
const TOO_MANY = 'Too many reset requests. Try again in an hour.'

/**
 * Emails a one-time link if the address belongs to an active admin. The caller always
 * gets the same answer, so the form does not reveal which addresses are admins.
 */
export async function requestPasswordReset(input: {
  email: string
  ip: string | null
  now?: Date
}): Promise<void> {
  const email = input.email.trim().toLowerCase()
  const now = input.now ?? new Date()
  await enforceRateLimit(`pw-reset:email:${email}`, PER_EMAIL, TOO_MANY)
  if (input.ip) await enforceRateLimit(`pw-reset:ip:${input.ip}`, PER_IP, TOO_MANY)

  const [user] = await getDb()
    .select({ id: users.id, roles: users.roles, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  if (!user || !user.roles.includes('ADMIN') || user.status !== 'ACTIVE') return

  const token = generateSessionToken()
  await getDb().transaction(async (tx) => {
    // Only the newest link works.
    await tx
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)))
    await tx.insert(passwordResets).values({
      userId: user.id,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(now.getTime() + RESET_TTL_MINUTES * 60_000),
    })
  })

  const link = new URL(`/admin/reset-password?token=${token}`, getEnv().APP_URL).toString()
  try {
    await sendEmail({
      to: email,
      subject: 'Reset your Kaamico admin password',
      text: [
        'Someone asked to reset the password for your Kaamico admin account.',
        '',
        `Choose a new password here (the link works once, for ${RESET_TTL_MINUTES} minutes):`,
        link,
        '',
        'If this was not you, ignore this email. Your password stays the same.',
      ].join('\n'),
    })
  } catch (error) {
    // The answer stays the same either way; operations see the failure in the logs.
    logger.error({ err: error, userId: user.id }, 'password reset email failed')
  }
}

const invalidLink = () =>
  businessRule(
    'RESET_LINK_INVALID',
    'This reset link has expired or was already used. Ask for a new one.',
  )

/**
 * Sets a new password from a valid link, uses the link up and signs the admin out
 * everywhere. Audited like any admin change.
 */
export async function resetPassword(input: {
  token: string
  password: string
  context: AuditContext
  now?: Date
}): Promise<void> {
  const now = input.now ?? new Date()
  const passwordHash = await hashPassword(input.password)
  await getDb().transaction(async (tx) => {
    const [row] = await tx.execute<{ id: string; user_id: string }>(sql`
      select r.id, r.user_id from password_resets r
      join users u on u.id = r.user_id
      where r.token_hash = ${sha256Hex(input.token)} and r.used_at is null
        and r.expires_at > ${now.toISOString()}::timestamptz
        and 'ADMIN' = any(u.roles) and u.status = 'ACTIVE'
      for update of r`)
    if (!row) throw invalidLink()
    await tx.update(passwordResets).set({ usedAt: now }).where(eq(passwordResets.id, row.id))
    await tx.update(users).set({ passwordHash }).where(eq(users.id, row.user_id))
    await tx.delete(authSessions).where(eq(authSessions.userId, row.user_id))
    await writeAudit(tx, { userId: row.user_id }, input.context, {
      action: 'admin.password_reset',
      entityType: 'user',
      entityId: row.user_id,
    })
  })
}
