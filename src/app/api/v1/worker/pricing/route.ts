import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { noStore, requireWorker } from '@/modules/workers/api'
import { getPricing, savePricing } from '@/modules/workers/pricing'

export const GET = route(async (request) => {
  const actor = await requireWorker(request)
  return Response.json({ items: await getPricing(actor.workerId) }, { headers: noStore })
})

/** Bulk upsert; each existing price must carry the version it was read at. */
export const PUT = route(async (request) => {
  const actor = await requireWorker(request)
  const items = await savePricing(actor, await readJson(request))
  return Response.json({ items }, { headers: noStore })
})
