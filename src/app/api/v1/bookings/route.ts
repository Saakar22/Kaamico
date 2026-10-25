import { route } from '@/lib/http'
import { idempotencyKeyFrom, idempotentResponse } from '@/lib/idempotency'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { createBooking } from '@/modules/bookings/create'
import { listCustomerBookings } from '@/modules/bookings/views'

export const GET = route(async (request) => {
  const actor = await requireApiActor(request)
  return Response.json(
    { bookings: await listCustomerBookings(actor) },
    { headers: { 'cache-control': 'no-store' } },
  )
})

/**
 * Creates a booking request (idempotent). Errors: WORKER_UNAVAILABLE, OUT_OF_RANGE,
 * SLOT_TAKEN (409 with `alternatives`), OFFER_BELOW_FLOOR, TOO_MANY_OPEN_REQUESTS.
 */
export const POST = route(async (request) => {
  const actor = await requireApiActor(request, { role: 'CUSTOMER' })
  const body = await readJson(request)
  const key = idempotencyKeyFrom(request)
  return idempotentResponse(
    request,
    { userId: actor.userId, route: 'POST /api/v1/bookings', body },
    async () => ({ status: 201, body: await createBooking(actor, body, key) }),
  )
})
