import { route } from '@/lib/http'
import { noStore, requireAdmin } from '@/modules/admin/api'
import { getApplicationForAdmin } from '@/modules/admin/verifications'

/** One application with worker summary, document metadata and its audit trail. */
export const GET = route<RouteContext<'/api/v1/admin/verifications/[id]'>>(async (request, ctx) => {
  await requireAdmin(request)
  return Response.json(
    { application: await getApplicationForAdmin((await ctx.params).id) },
    { headers: noStore },
  )
})
