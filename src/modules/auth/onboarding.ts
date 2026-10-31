import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { customerProfiles, users, workerProfiles } from '@/db/schema'
import { forbidden } from '@/lib/errors'
import { homePathFor, safeNextPath } from './redirects'
import type { Actor, Role } from './types'

export const onboardingInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter your name (at least 2 characters)')
    .max(60, 'Name must be at most 60 characters'),
  // ADMIN can never be self-assigned: it is not an accepted value here.
  role: z.enum(['CUSTOMER', 'WORKER']),
  /** Where a new customer was heading before signing in (`/login?next=`). */
  next: z.string().max(300).optional(),
})
export type OnboardingInput = z.infer<typeof onboardingInput>

/**
 * Sets the user's name and role. A customer can later choose WORKER to also offer
 * services; the WORKER role is added and an (unverified) worker profile created.
 */
export async function completeOnboarding(
  actor: Actor,
  input: OnboardingInput,
): Promise<{ roles: Role[]; redirectTo: string }> {
  if (actor.scope !== 'USER') throw forbidden('Admin sessions cannot complete onboarding')

  return getDb().transaction(async (tx) => {
    const [user] = await tx
      .update(users)
      .set({
        name: input.name,
        roles:
          input.role === 'WORKER'
            ? sql`case when 'WORKER' = any(${users.roles}) then ${users.roles} else array_append(${users.roles}, 'WORKER'::user_role) end`
            : users.roles,
      })
      .where(eq(users.id, actor.userId))
      .returning({ roles: users.roles })

    await tx.insert(customerProfiles).values({ userId: actor.userId }).onConflictDoNothing()
    if (input.role === 'WORKER') {
      await tx
        .insert(workerProfiles)
        .values({ userId: actor.userId, displayName: input.name })
        .onConflictDoNothing({ target: workerProfiles.userId })
    }

    const roles = user.roles as Role[]
    const home = homePathFor({ roles, needsOnboarding: false })
    // A new professional goes to setup first; a customer continues where they were going.
    const redirectTo = input.role === 'WORKER' ? home : safeNextPath(input.next, home)
    return { roles, redirectTo }
  })
}
