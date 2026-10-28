import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { users } from '@/db/schema'
import { conflict, forbidden, pgErrorCode } from '@/lib/errors'
import { onboardingInput } from './onboarding'
import type { Actor } from './types'

/** The signed-in person's own account details (§5.1 `/profile`). */

export const accountInput = z.object({
  name: onboardingInput.shape.name,
  /** Optional and unverified for now; kept for receipts and email sign-in later. */
  email: z
    .union([z.literal(''), z.email('Enter a valid email address').max(120)])
    .transform((v) => (v ? v.toLowerCase() : null)),
})

export type AccountView = { name: string | null; phone: string | null; email: string | null }

export async function getAccount(actor: Actor): Promise<AccountView> {
  const [row] = await getDb()
    .select({ name: users.name, phone: users.phone, email: users.email })
    .from(users)
    .where(eq(users.id, actor.userId))
  return row ?? { name: null, phone: null, email: null }
}

export async function updateAccount(actor: Actor, raw: unknown): Promise<AccountView> {
  if (actor.scope !== 'USER') throw forbidden('Admin accounts are managed separately')
  const input = accountInput.parse(raw)
  try {
    const [row] = await getDb()
      .update(users)
      .set({
        name: input.name,
        email: input.email,
        // Only a new address needs verifying again.
        emailVerified: sql`case when ${users.email} is distinct from ${input.email}::citext then false else ${users.emailVerified} end`,
      })
      .where(eq(users.id, actor.userId))
      .returning({ name: users.name, phone: users.phone, email: users.email })
    return row
  } catch (error) {
    // Do not reveal whose address it is.
    if (pgErrorCode(error) === '23505') {
      throw conflict('EMAIL_UNAVAILABLE', 'This email address cannot be used. Try another one.')
    }
    throw error
  }
}
