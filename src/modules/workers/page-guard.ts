import 'server-only'
import { redirect } from 'next/navigation'
import { requirePageActor } from '@/modules/auth/page-guards'
import type { Actor } from '@/modules/auth/types'

/** Worker pages: the signed-in professional and their worker profile id. */
export async function requireWorkerPage(): Promise<Actor & { workerId: string }> {
  const actor = await requirePageActor('WORKER')
  // Every WORKER gets a profile at onboarding; anything else means onboarding is unfinished.
  if (!actor.workerId) redirect('/login?step=details')
  return { ...actor, workerId: actor.workerId }
}
