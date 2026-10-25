import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { getCustomerBooking } from '@/modules/bookings/views'

/** The customer's own booking, with thread, charges, history and (once confirmed) the start code. */
export const GET = route<RouteContext<'/api/v1/bookings/[id]'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  const booking = await getCustomerBooking(actor, (await ctx.params).id)
  return Response.json({ booking }, { headers: { 'cache-control': 'no-store' } })
})
