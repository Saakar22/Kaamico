import { route } from '@/lib/http'
import { noStore, requireAdmin } from '@/modules/admin/api'
import { getAdminBooking } from '@/modules/admin/bookings'

/** Full booking for investigation: both parties, every offer and message, charges, history. */
export const GET = route<RouteContext<'/api/v1/admin/bookings/[id]'>>(async (request, ctx) => {
  await requireAdmin(request)
  return Response.json(
    { booking: await getAdminBooking((await ctx.params).id) },
    { headers: noStore },
  )
})
