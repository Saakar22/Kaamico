import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { confirmCash } from '@/modules/payments/payments'

/** The assigned professional confirms they received the cash. */
export const POST = route<RouteContext<'/api/v1/payments/[id]/confirm-cash'>>(
  async (request, ctx) => {
    const actor = await requireApiActor(request, { role: 'WORKER' })
    return Response.json(await confirmCash(actor, (await ctx.params).id))
  },
)
