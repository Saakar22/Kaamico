import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { transition } from '@/modules/bookings/lifecycle'

/** The assigned professional moves the job: EN_ROUTE, ARRIVED, IN_PROGRESS (start code), COMPLETED. */
export const POST = route<RouteContext<'/api/v1/bookings/[id]/transitions'>>(
  async (request, ctx) => {
    const actor = await requireApiActor(request, { role: 'WORKER' })
    const result = await transition(actor, (await ctx.params).id, await readJson(request))
    return Response.json(result, { headers: { 'cache-control': 'no-store' } })
  },
)
