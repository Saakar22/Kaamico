import { route } from '@/lib/http'
import { noStore, requireAdmin, searchParams } from '@/modules/admin/api'
import { getAdminAnalytics } from '@/modules/analytics/admin'

/** Funnel, negotiation outcomes and supply by locality (`?days=7|30|90`). */
export const GET = route(async (request) => {
  await requireAdmin(request)
  return Response.json(await getAdminAnalytics(searchParams(request)), { headers: noStore })
})
