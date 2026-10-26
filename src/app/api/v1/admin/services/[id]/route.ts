import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireAdmin } from '@/modules/admin/api'
import { updateService } from '@/modules/admin/catalog'
import { auditContext } from '@/modules/audit/audit'

/** Partial update; `{isActive: false}` hides the service instead of deleting it. */
export const PATCH = route<RouteContext<'/api/v1/admin/services/[id]'>>(
  async (request, ctx, { requestId }) => {
    const admin = await requireAdmin(request)
    const result = await updateService(
      admin,
      (await ctx.params).id,
      await readJson(request),
      auditContext(request, requestId),
    )
    return Response.json({ service: result })
  },
)
