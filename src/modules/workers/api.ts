import 'server-only'
import { requireApiActor } from '@/modules/auth/actor'
import type { Actor } from '@/modules/auth/types'
import { workerIdOf } from './profile'

/** Every /api/v1/worker handler: signed in, WORKER role, and a worker profile from the session. */
export async function requireWorker(request: Request): Promise<Actor & { workerId: string }> {
  const actor = await requireApiActor(request, { role: 'WORKER' })
  return { ...actor, workerId: workerIdOf(actor) }
}

export const noStore = { 'cache-control': 'no-store' }
