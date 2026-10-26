import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireAdmin } from '@/modules/admin/api'
import { decideVerification } from '@/modules/admin/verifications'
import { auditContext } from '@/modules/audit/audit'

/** `{decision: APPROVE|REJECT|REQUEST_RESUBMISSION, reason?, expectedVersion}`; audited. */
export const POST = route<RouteContext<'/api/v1/admin/verifications/[id]/decision'>>(
  async (request, ctx, { requestId }) => {
    const admin = await requireAdmin(request)
    const result = await decideVerification(
      admin,
      (await ctx.params).id,
      await readJson(request),
      auditContext(request, requestId),
    )
    return Response.json(result)
  },
)
