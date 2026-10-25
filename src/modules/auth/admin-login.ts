import 'server-only'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { users } from '@/db/schema'
import { AppError } from '@/lib/errors'
import {
  assertBelowLimit,
  hitRateLimit,
  resetRateLimit,
  type RateLimitRule,
} from '@/lib/rate-limit'
import { verifyAgainstDummy, verifyPassword } from './password'
import { createSession } from './sessions'

const PER_EMAIL: RateLimitRule = { limit: 10, windowSeconds: 900 }
const PER_IP: RateLimitRule = { limit: 30, windowSeconds: 900 }
const LOCKED = 'Too many failed attempts. Try again in 15 minutes.'

/** Same message for unknown email, wrong password and non-admins, so it reveals nothing. */
const invalidCredentials = () =>
  new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.', { status: 401 })

export async function loginAdmin(input: {
  email: string
  password: string
  ip: string | null
  userAgent: string | null
}): Promise<{ token: string; expiresAt: Date; userId: string }> {
  const email = input.email.trim().toLowerCase()
  const emailBucket = `admin-login:email:${email}`
  const ipBucket = input.ip ? `admin-login:ip:${input.ip}` : null

  await assertBelowLimit(emailBucket, PER_EMAIL, LOCKED)
  if (ipBucket) await assertBelowLimit(ipBucket, PER_IP, LOCKED)

  const [user] = await getDb()
    .select({
      id: users.id,
      roles: users.roles,
      status: users.status,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  const eligible =
    user && user.passwordHash && user.roles.includes('ADMIN') && user.status === 'ACTIVE'
  const ok = eligible
    ? await verifyPassword(input.password, user.passwordHash!)
    : await verifyAgainstDummy(input.password)

  if (!ok || !user) {
    await hitRateLimit(emailBucket, PER_EMAIL)
    if (ipBucket) await hitRateLimit(ipBucket, PER_IP)
    throw invalidCredentials()
  }

  await resetRateLimit(emailBucket)
  await getDb().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))
  const session = await createSession({
    userId: user.id,
    scope: 'ADMIN',
    ip: input.ip,
    userAgent: input.userAgent,
  })
  return { ...session, userId: user.id }
}
