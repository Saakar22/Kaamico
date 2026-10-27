import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireAdmin } from '@/modules/admin/api'
import { auditContext } from '@/modules/audit/audit'
import { resolveDispute } from '@/modules/disputes/disputes'

/** `{decision, refundPaise?, note, expectedVersion}`: refund, ledger, booking and audit in one transaction. */
export const POST = route<RouteContext<'/api/v1/admin/disputes/[id]/resolve'>>(
  async (request, ctx, { requestId }) => {
    const admin = await requireAdmin(request)
    const result = await resolveDispute(
      admin,
      (await ctx.params).id,
      await readJson(request),
      auditContext(request, requestId),
    )
    return Response.json(result)
  },
)
