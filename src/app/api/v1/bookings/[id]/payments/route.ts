import { route } from '@/lib/http'
import { idempotencyKeyFrom, idempotentResponse } from '@/lib/idempotency'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { startPayment } from '@/modules/payments/payments'

/**
 * `{method: CASH|SIMULATED}` for a completed booking (idempotent). The amount comes from
 * the booking, never the request.
 */
export const POST = route<RouteContext<'/api/v1/bookings/[id]/payments'>>(async (request, ctx) => {
  const actor = await requireApiActor(request, { role: 'CUSTOMER' })
  const { id } = await ctx.params
  const body = await readJson(request)
  const key = idempotencyKeyFrom(request)
  return idempotentResponse(
    request,
    { userId: actor.userId, route: `POST /api/v1/bookings/${id}/payments`, body },
    async () => ({ status: 201, body: await startPayment(actor, id, body, key) }),
  )
})
