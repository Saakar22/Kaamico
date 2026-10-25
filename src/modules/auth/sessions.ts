import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { getDb, type Database } from '@/db/client'
import { authSessions } from '@/db/schema'
import { generateSessionToken, sha256Hex } from './tokens'
import type { Actor, Role, SessionScope } from './types'

const HOUR = 60 * 60 * 1000
/** Customer/worker sessions roll forward on activity; admin sessions are absolute. */
const TTL: Record<SessionScope, number> = { USER: 30 * 24 * HOUR, ADMIN: 8 * HOUR }
const TOUCH_INTERVAL = HOUR

type Executor = Pick<Database, 'insert' | 'execute' | 'delete' | 'update'>

export async function createSession(
  input: { userId: string; scope: SessionScope; ip: string | null; userAgent: string | null },
  db: Executor = getDb(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + TTL[input.scope])
  await db.insert(authSessions).values({
    tokenHash: sha256Hex(token),
    userId: input.userId,
    scope: input.scope,
    expiresAt,
    ip: input.ip,
    userAgent: input.userAgent,
  })
  return { token, expiresAt }
}

type SessionRow = {
  session_id: string
  scope: SessionScope
  expires_at: Date
  last_seen_at: Date
  user_id: string
  name: string | null
  phone: string | null
  email: string | null
  roles: Role[] | string
  status: string
  deleted_at: Date | null
  worker_id: string | null
}

function parseRoles(roles: Role[] | string): Role[] {
  // postgres.js returns enum arrays as '{A,B}' text unless the type is registered.
  return Array.isArray(roles)
    ? roles
    : (roles.replace(/[{}]/g, '').split(',').filter(Boolean) as Role[])
}

/** Resolves a session token to the acting user, or null if invalid, expired or the user is inactive. */
export async function resolveSession(token: string): Promise<Actor | null> {
  if (!token || token.length > 100) return null
  const db = getDb()
  const rows = await db.execute<SessionRow>(sql`
    select s.id as session_id, s.scope, s.expires_at, s.last_seen_at,
           u.id as user_id, u.name, u.phone, u.email::text as email, u.roles, u.status, u.deleted_at,
           w.id as worker_id
    from auth_sessions s
    join users u on u.id = s.user_id
    left join worker_profiles w on w.user_id = u.id
    where s.token_hash = ${sha256Hex(token)} and s.expires_at > now()`)
  const row = rows[0]
  if (!row || row.status !== 'ACTIVE' || row.deleted_at) return null

  const roles = parseRoles(row.roles)
  // An admin session is only valid while the user still holds the ADMIN role.
  if (row.scope === 'ADMIN' && !roles.includes('ADMIN')) return null

  const lastSeen = new Date(row.last_seen_at).getTime()
  if (Date.now() - lastSeen > TOUCH_INTERVAL) {
    await db
      .update(authSessions)
      .set(
        row.scope === 'USER'
          ? { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + TTL.USER) }
          : { lastSeenAt: new Date() },
      )
      .where(eq(authSessions.id, row.session_id))
  }

  return {
    userId: row.user_id,
    sessionId: row.session_id,
    scope: row.scope,
    name: row.name,
    phone: row.phone,
    email: row.email,
    roles,
    needsOnboarding: row.name === null && row.scope === 'USER',
    workerId: row.worker_id,
  }
}

export async function revokeSession(token: string): Promise<void> {
  await getDb()
    .delete(authSessions)
    .where(eq(authSessions.tokenHash, sha256Hex(token)))
}

/** Signs a user out everywhere (e.g. on suspension). */
export async function revokeUserSessions(userId: string): Promise<void> {
  await getDb().delete(authSessions).where(eq(authSessions.userId, userId))
}
