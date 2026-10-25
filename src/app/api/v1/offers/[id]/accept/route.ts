import { route } from '@/lib/http'
import { idempotentResponse } from '@/lib/idempotency'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { acceptOffer } from '@/modules/negotiation/offers'

/**
 * Accepts the other side's offer and confirms the booking (idempotent). Body:
 * `{expectedBookingVersion}`. Errors: STALE_VERSION, OFFER_NOT_PENDING, EXPIRED (410),
 * SLOT_TAKEN, WORKER_UNAVAILABLE.
 */
export const POST = route<RouteContext<'/api/v1/offers/[id]/accept'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  const { id } = await ctx.params
  const body = await readJson(request)
  return idempotentResponse(
    request,
    { userId: actor.userId, route: `POST /api/v1/offers/${id}/accept`, body },
    async () => ({ status: 200, body: await acceptOffer(actor, id, body) }),
  )
})
