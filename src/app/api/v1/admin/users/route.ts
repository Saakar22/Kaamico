import { route } from '@/lib/http'
import { noStore, requireAdmin, searchParams } from '@/modules/admin/api'
import { listAdminUsers } from '@/modules/admin/users'

/** `?q&role&status&page`. */
export const GET = route(async (request) => {
  await requireAdmin(request)
  return Response.json(await listAdminUsers(searchParams(request)), { headers: noStore })
})
