import { route } from '@/lib/http'
import { enforceRateLimit } from '@/lib/rate-limit'
import { noStore, requireWorker } from '@/modules/workers/api'
import { heartbeat } from '@/modules/workers/status'

/** Heartbeat from an open worker app; keeps an online professional "available now". */
export const POST = route(async (request) => {
  const actor = await requireWorker(request)
  await enforceRateLimit(
    `presence:worker:${actor.workerId}`,
    { limit: 30, windowSeconds: 60 * 60 },
    'Too many presence updates',
  )
  return Response.json({ status: await heartbeat(actor) }, { headers: noStore })
})
