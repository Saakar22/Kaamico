import { route } from '@/lib/http'
import { noStore, requireAdmin, searchParams } from '@/modules/admin/api'
import { listAdminBookings } from '@/modules/admin/bookings'

/** `?status&q&city&from&to&page` (dates are IST, YYYY-MM-DD). */
export const GET = route(async (request) => {
  await requireAdmin(request)
  return Response.json(await listAdminBookings(searchParams(request)), { headers: noStore })
})
