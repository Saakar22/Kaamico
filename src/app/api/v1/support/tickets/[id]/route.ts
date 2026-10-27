import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { getTicket } from '@/modules/support/support'

/** The ticket and its messages (owner or admin). */
export const GET = route<RouteContext<'/api/v1/support/tickets/[id]'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  return Response.json(
    { ticket: await getTicket(actor, (await ctx.params).id) },
    { headers: { 'cache-control': 'no-store' } },
  )
})
