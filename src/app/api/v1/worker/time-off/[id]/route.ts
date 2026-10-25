import { route } from '@/lib/http'
import { deleteTimeOff } from '@/modules/availability/schedule'
import { requireWorker } from '@/modules/workers/api'

export const DELETE = route<RouteContext<'/api/v1/worker/time-off/[id]'>>(async (request, ctx) => {
  const actor = await requireWorker(request)
  await deleteTimeOff(actor, (await ctx.params).id)
  return new Response(null, { status: 204 })
})
