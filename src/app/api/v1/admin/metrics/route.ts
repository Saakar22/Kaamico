import { route } from '@/lib/http'
import { noStore, requireAdmin } from '@/modules/admin/api'
import { getAdminMetrics } from '@/modules/admin/metrics'

/** KPI tiles for the admin overview. */
export const GET = route(async (request) => {
  await requireAdmin(request)
  return Response.json(await getAdminMetrics(), { headers: noStore })
})
