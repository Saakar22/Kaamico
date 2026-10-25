import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { decideCharge } from '@/modules/bookings/lifecycle'

/** The customer approves an extra charge; the booking total rises in the same transaction. */
export const POST = route<RouteContext<'/api/v1/charges/[id]/approve'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  const result = await decideCharge(actor, (await ctx.params).id, 'APPROVED')
  return Response.json(result, { headers: { 'cache-control': 'no-store' } })
})
