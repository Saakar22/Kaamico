import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { getCustomerBooking } from '@/modules/bookings/views'

/** Customer polling endpoint for the negotiation thread (workers poll their request instead). */
export const GET = route<RouteContext<'/api/v1/bookings/[id]/negotiation'>>(
  async (request, ctx) => {
    const actor = await requireApiActor(request)
    const b = await getCustomerBooking(actor, (await ctx.params).id)
    return Response.json(
      {
        status: b.status,
        version: b.version,
        offers: b.offers,
        messages: b.messages,
        negotiation: b.negotiation,
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  },
)
