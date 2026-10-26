import { route } from '@/lib/http'
import { idempotentResponse } from '@/lib/idempotency'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { createReview } from '@/modules/reviews/reviews'

/** `{rating, tags?, comment?}`: one review per completed booking, within 14 days (idempotent). */
export const POST = route<RouteContext<'/api/v1/bookings/[id]/review'>>(async (request, ctx) => {
  const actor = await requireApiActor(request, { role: 'CUSTOMER' })
  const { id } = await ctx.params
  const body = await readJson(request)
  return idempotentResponse(
    request,
    { userId: actor.userId, route: `POST /api/v1/bookings/${id}/review`, body },
    async () => ({ status: 201, body: await createReview(actor, id, body) }),
  )
})
