import { route } from '@/lib/http'
import { idempotentResponse } from '@/lib/idempotency'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { makeOffer } from '@/modules/negotiation/offers'

/** A new offer or counter-offer (idempotent). Rules: IMPLEMENTATION_PLAN.md §11.2. */
export const POST = route<RouteContext<'/api/v1/bookings/[id]/offers'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  const { id } = await ctx.params
  const body = await readJson(request)
  return idempotentResponse(
    request,
    { userId: actor.userId, route: `POST /api/v1/bookings/${id}/offers`, body },
    async () => ({ status: 201, body: await makeOffer(actor, id, body) }),
  )
})
