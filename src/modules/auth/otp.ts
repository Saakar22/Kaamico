import 'server-only'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { otpChallenges, users } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { enforceRateLimit } from '@/lib/rate-limit'
import { authSecret } from '@/lib/secrets'
import { getOtpSender } from './otp-sender'
import { maskPhone, normalizeIndianMobile } from './phone'
import { createSession } from './sessions'
import { generateOtp, hashOtp, safeEqualHex } from './tokens'

export const OTP_TTL_SECONDS = 300
export const OTP_MAX_ATTEMPTS = 5

function parsePhone(input: string): string {
  const phone = normalizeIndianMobile(input)
  if (!phone) {
    throw new AppError('VALIDATION_FAILED', 'Enter a valid 10-digit Indian mobile number', {
      details: {
        issues: [{ path: 'phone', message: 'Enter a valid 10-digit Indian mobile number' }],
      },
    })
  }
  return phone
}

export type OtpRequestResult = {
  maskedPhone: string
  expiresInSeconds: number
  /** Present only in simulated mode: the code is shown on screen instead of sent by SMS. */
  simulatedCode?: string
}

export async function requestOtp(input: {
  phone: string
  ip: string | null
}): Promise<OtpRequestResult> {
  const phone = parsePhone(input.phone)
  await enforceRateLimit(
    `otp:phone:${phone}`,
    { limit: 3, windowSeconds: 600 },
    'Too many codes requested for this number. Please wait a few minutes.',
  )
  if (input.ip) {
    await enforceRateLimit(
      `otp:ip:${input.ip}`,
      { limit: 10, windowSeconds: 3600 },
      'Too many codes requested. Please try again later.',
    )
  }

  const code = generateOtp()
  const sender = getOtpSender()
  await getDb()
    .insert(otpChallenges)
    .values({
      phone,
      codeHash: hashOtp(phone, code, authSecret()),
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      ip: input.ip,
    })
  await sender.send(phone, code)

  return {
    maskedPhone: maskPhone(phone),
    expiresInSeconds: OTP_TTL_SECONDS,
    ...(sender.simulated ? { simulatedCode: code } : {}),
  }
}

const invalidCode = (remainingAttempts?: number) =>
  new AppError('OTP_INVALID', 'That code is incorrect or has expired.', {
    status: 400,
    details: remainingAttempts === undefined ? undefined : { remainingAttempts },
  })

export async function verifyOtp(input: {
  phone: string
  code: string
  ip: string | null
  userAgent: string | null
}): Promise<{ token: string; expiresAt: Date; userId: string; isNewUser: boolean }> {
  const phone = parsePhone(input.phone)
  if (!/^\d{6}$/.test(input.code)) throw invalidCode()
  if (input.ip) {
    await enforceRateLimit(
      `otp-verify:ip:${input.ip}`,
      { limit: 30, windowSeconds: 3600 },
      'Too many attempts. Please try again later.',
    )
  }

  const db = getDb()
  // The attempt counter must persist even when the code is wrong, so the outcome is
  // returned from the transaction and the error is thrown after it commits.
  const outcome = await db.transaction(async (tx) => {
    const [challenge] = await tx
      .select()
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.phone, phone),
          isNull(otpChallenges.consumedAt),
          gt(otpChallenges.expiresAt, sql`now()`),
        ),
      )
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1)
      .for('update')

    if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) return { ok: false as const }

    if (!safeEqualHex(challenge.codeHash, hashOtp(phone, input.code, authSecret()))) {
      const attempts = challenge.attempts + 1
      await tx
        .update(otpChallenges)
        .set(attempts >= OTP_MAX_ATTEMPTS ? { attempts, consumedAt: new Date() } : { attempts })
        .where(eq(otpChallenges.id, challenge.id))
      return { ok: false as const, remaining: OTP_MAX_ATTEMPTS - attempts }
    }

    await tx
      .update(otpChallenges)
      .set({ consumedAt: new Date() })
      .where(eq(otpChallenges.id, challenge.id))

    // First verified sign-in creates the account; concurrent verifies converge on one row.
    const [user] = await tx
      .insert(users)
      .values({ phone, phoneVerifiedAt: new Date(), lastLoginAt: new Date() })
      .onConflictDoUpdate({
        target: users.phone,
        set: {
          lastLoginAt: new Date(),
          phoneVerifiedAt: sql`coalesce(${users.phoneVerifiedAt}, now())`,
        },
      })
      .returning({
        id: users.id,
        status: users.status,
        createdAt: users.createdAt,
        name: users.name,
      })

    if (user.status !== 'ACTIVE') return { ok: false as const, suspended: true }

    const session = await createSession(
      { userId: user.id, scope: 'USER', ip: input.ip, userAgent: input.userAgent },
      tx,
    )
    return { ok: true as const, ...session, userId: user.id, isNewUser: user.name === null }
  })

  if (!outcome.ok) {
    if ('suspended' in outcome) {
      throw new AppError(
        'ACCOUNT_SUSPENDED',
        'This account is suspended. Please contact support.',
        { status: 403 },
      )
    }
    throw invalidCode('remaining' in outcome ? outcome.remaining : undefined)
  }
  return outcome
}
