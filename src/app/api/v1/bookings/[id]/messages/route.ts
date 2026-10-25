import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { postMessage } from '@/modules/negotiation/offers'

/** A short message on the thread; phone numbers and UPI IDs are masked. */
export const POST = route<RouteContext<'/api/v1/bookings/[id]/messages'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  const message = await postMessage(actor, (await ctx.params).id, await readJson(request))
  return Response.json({ message }, { status: 201, headers: { 'cache-control': 'no-store' } })
})
