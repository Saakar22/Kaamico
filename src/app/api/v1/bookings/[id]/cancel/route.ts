import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { cancelBooking } from '@/modules/bookings/lifecycle'

/** Customer owner or assigned professional; policy in IMPLEMENTATION_PLAN.md §11.3. */
export const POST = route<RouteContext<'/api/v1/bookings/[id]/cancel'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  const result = await cancelBooking(actor, (await ctx.params).id, await readJson(request))
  return Response.json(result, { headers: { 'cache-control': 'no-store' } })
})
