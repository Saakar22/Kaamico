import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { withdrawOffer } from '@/modules/negotiation/offers'

export const POST = route<RouteContext<'/api/v1/offers/[id]/withdraw'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  const result = await withdrawOffer(actor, (await ctx.params).id)
  return Response.json(result, { headers: { 'cache-control': 'no-store' } })
})
