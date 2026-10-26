import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireAdmin } from '@/modules/admin/api'
import { updateCategory } from '@/modules/admin/catalog'
import { auditContext } from '@/modules/audit/audit'

/** Partial update; `{isActive: false}` hides the category instead of deleting it. */
export const PATCH = route<RouteContext<'/api/v1/admin/categories/[id]'>>(
  async (request, ctx, { requestId }) => {
    const admin = await requireAdmin(request)
    const result = await updateCategory(
      admin,
      (await ctx.params).id,
      await readJson(request),
      auditContext(request, requestId),
    )
    return Response.json({ category: result })
  },
)
