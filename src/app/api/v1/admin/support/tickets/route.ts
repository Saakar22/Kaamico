import { route } from '@/lib/http'
import { noStore, requireAdmin, searchParams } from '@/modules/admin/api'
import { listAdminTickets } from '@/modules/support/support'

/** `?status=ACTIVE|RESOLVED|CLOSED|ALL&page=` */
export const GET = route(async (request) => {
  await requireAdmin(request)
  return Response.json(await listAdminTickets(searchParams(request)), { headers: noStore })
})
