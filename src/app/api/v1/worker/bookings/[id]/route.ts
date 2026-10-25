import { route } from '@/lib/http'
import { getWorkerBooking } from '@/modules/bookings/views'
import { noStore, requireWorker } from '@/modules/workers/api'

/** One assigned job; the full address only while it is active (and 24 h after completion). */
export const GET = route<RouteContext<'/api/v1/worker/bookings/[id]'>>(async (request, ctx) => {
  const actor = await requireWorker(request)
  const booking = await getWorkerBooking(actor, (await ctx.params).id)
  return Response.json({ booking }, { headers: noStore })
})
