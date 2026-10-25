import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { rejectOffer } from '@/modules/negotiation/offers'

export const POST = route<RouteContext<'/api/v1/offers/[id]/reject'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  const result = await rejectOffer(actor, (await ctx.params).id, await readJson(request))
  return Response.json(result, { headers: { 'cache-control': 'no-store' } })
})
