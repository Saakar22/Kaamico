import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { decideCharge } from '@/modules/bookings/lifecycle'

export const POST = route<RouteContext<'/api/v1/charges/[id]/reject'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  const result = await decideCharge(actor, (await ctx.params).id, 'REJECTED')
  return Response.json(result, { headers: { 'cache-control': 'no-store' } })
})
