import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { addTicketMessage } from '@/modules/support/support'

/** `{body}` from the owner or an admin. */
export const POST = route<RouteContext<'/api/v1/support/tickets/[id]/messages'>>(
  async (request, ctx) => {
    const actor = await requireApiActor(request)
    const message = await addTicketMessage(actor, (await ctx.params).id, await readJson(request))
    return Response.json({ message }, { status: 201 })
  },
)
