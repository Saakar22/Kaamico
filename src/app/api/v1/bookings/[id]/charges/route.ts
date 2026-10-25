import { route } from '@/lib/http'
import { idempotentResponse } from '@/lib/idempotency'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { proposeCharge } from '@/modules/bookings/lifecycle'

/** The assigned professional proposes an extra charge (idempotent); the customer must approve it. */
export const POST = route<RouteContext<'/api/v1/bookings/[id]/charges'>>(async (request, ctx) => {
  const actor = await requireApiActor(request, { role: 'WORKER' })
  const { id } = await ctx.params
  const body = await readJson(request)
  return idempotentResponse(
    request,
    { userId: actor.userId, route: `POST /api/v1/bookings/${id}/charges`, body },
    async () => ({ status: 201, body: await proposeCharge(actor, id, body) }),
  )
})
