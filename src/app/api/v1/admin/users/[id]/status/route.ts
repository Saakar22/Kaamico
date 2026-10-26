import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireAdmin } from '@/modules/admin/api'
import { setUserStatus } from '@/modules/admin/users'
import { auditContext } from '@/modules/audit/audit'

/** `{status: ACTIVE|SUSPENDED, reason}`; audited. */
export const PATCH = route<RouteContext<'/api/v1/admin/users/[id]/status'>>(
  async (request, ctx, { requestId }) => {
    const admin = await requireAdmin(request)
    const result = await setUserStatus(
      admin,
      (await ctx.params).id,
      await readJson(request),
      auditContext(request, requestId),
    )
    return Response.json(result)
  },
)
