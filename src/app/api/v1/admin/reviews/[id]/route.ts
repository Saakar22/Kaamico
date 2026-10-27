import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireAdmin } from '@/modules/admin/api'
import { auditContext } from '@/modules/audit/audit'
import { moderateReview } from '@/modules/reviews/moderation'

/** `{action: HIDE|RESTORE, reason}`; audited, and the rating is recalculated. */
export const PATCH = route<RouteContext<'/api/v1/admin/reviews/[id]'>>(
  async (request, ctx, { requestId }) => {
    const admin = await requireAdmin(request)
    const result = await moderateReview(
      admin,
      (await ctx.params).id,
      await readJson(request),
      auditContext(request, requestId),
    )
    return Response.json(result)
  },
)
