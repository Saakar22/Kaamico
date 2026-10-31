import { route } from '@/lib/http'
import { idempotentResponse } from '@/lib/idempotency'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { rateCustomer } from '@/modules/reviews/customer-ratings'

/** `{rating, tags?, note?}`: the professional's private rating of the customer (idempotent). */
export const POST = route<RouteContext<'/api/v1/bookings/[id]/customer-rating'>>(
  async (request, ctx) => {
    const actor = await requireApiActor(request, { role: 'WORKER' })
    const { id } = await ctx.params
    const body = await readJson(request)
    return idempotentResponse(
      request,
      { userId: actor.userId, route: `POST /api/v1/bookings/${id}/customer-rating`, body },
      async () => ({ status: 201, body: await rateCustomer(actor, id, body) }),
    )
  },
)
