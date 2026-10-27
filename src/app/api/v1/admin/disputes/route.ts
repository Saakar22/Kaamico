import { route } from '@/lib/http'
import { noStore, requireAdmin, searchParams } from '@/modules/admin/api'
import { listAdminDisputes } from '@/modules/disputes/disputes'

/** `?status=OPEN|CLOSED|ALL&page=` */
export const GET = route(async (request) => {
  await requireAdmin(request)
  return Response.json(await listAdminDisputes(searchParams(request)), { headers: noStore })
})
