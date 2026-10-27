import { route } from '@/lib/http'
import { noStore, requireAdmin } from '@/modules/admin/api'
import { getAdminDispute } from '@/modules/disputes/disputes'

export const GET = route<RouteContext<'/api/v1/admin/disputes/[id]'>>(async (request, ctx) => {
  await requireAdmin(request)
  return Response.json(
    { dispute: await getAdminDispute((await ctx.params).id) },
    { headers: noStore },
  )
})
