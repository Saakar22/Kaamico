import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { declineRequest } from '@/modules/bookings/lifecycle'
import { noStore, requireWorker } from '@/modules/workers/api'

export const POST = route<RouteContext<'/api/v1/worker/requests/[id]/decline'>>(
  async (request, ctx) => {
    const actor = await requireWorker(request)
    const result = await declineRequest(actor, (await ctx.params).id, await readJson(request))
    return Response.json(result, { headers: noStore })
  },
)
