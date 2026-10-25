import { route } from '@/lib/http'
import { getWorkerRequest } from '@/modules/bookings/views'
import { noStore, requireWorker } from '@/modules/workers/api'

/** One request with its thread; the first view marks it SEEN. */
export const GET = route<RouteContext<'/api/v1/worker/requests/[id]'>>(async (request, ctx) => {
  const actor = await requireWorker(request)
  const result = await getWorkerRequest(actor, (await ctx.params).id)
  return Response.json({ request: result }, { headers: noStore })
})
