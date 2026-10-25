import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { noStore, requireWorker } from '@/modules/workers/api'
import { setStatus } from '@/modules/workers/status'

/** Online/offline and pause. Going online requires verification (422 NOT_VERIFIED). */
export const POST = route(async (request) => {
  const actor = await requireWorker(request)
  const status = await setStatus(actor, await readJson(request))
  return Response.json({ status }, { headers: noStore })
})
