import { route } from '@/lib/http'
import { idempotentResponse } from '@/lib/idempotency'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { disputeForBooking, raiseDispute } from '@/modules/disputes/disputes'

type Ctx = RouteContext<'/api/v1/bookings/[id]/disputes'>

/** The latest reported problem on the booking, or null. */
export const GET = route<Ctx>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  const dispute = await disputeForBooking(actor, (await ctx.params).id)
  return Response.json({ dispute }, { headers: { 'cache-control': 'no-store' } })
})

/** `{reason, description}`: report a problem (customer or assigned professional; idempotent). */
export const POST = route<Ctx>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  const { id } = await ctx.params
  const body = await readJson(request)
  return idempotentResponse(
    request,
    { userId: actor.userId, route: `POST /api/v1/bookings/${id}/disputes`, body },
    async () => ({ status: 201, body: await raiseDispute(actor, id, body) }),
  )
})
