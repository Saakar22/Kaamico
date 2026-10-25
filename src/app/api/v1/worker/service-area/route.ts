import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { noStore, requireWorker } from '@/modules/workers/api'
import { setServiceArea } from '@/modules/workers/profile'

/** Base area (`localityId`, or `lat`/`lng`) and travel radius (1 to 25 km). */
export const PUT = route(async (request) => {
  const actor = await requireWorker(request)
  const serviceArea = await setServiceArea(actor, await readJson(request))
  return Response.json({ serviceArea }, { headers: noStore })
})
