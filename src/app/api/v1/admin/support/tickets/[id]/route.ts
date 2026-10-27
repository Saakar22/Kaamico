import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireAdmin } from '@/modules/admin/api'
import { auditContext } from '@/modules/audit/audit'
import { setTicketStatus } from '@/modules/support/support'

/** `{status: OPEN|RESOLVED|CLOSED}` (audited). */
export const PATCH = route<RouteContext<'/api/v1/admin/support/tickets/[id]'>>(
  async (request, ctx, { requestId }) => {
    const admin = await requireAdmin(request)
    const result = await setTicketStatus(
      admin,
      (await ctx.params).id,
      await readJson(request),
      auditContext(request, requestId),
    )
    return Response.json(result)
  },
)
