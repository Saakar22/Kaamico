import { route } from '@/lib/http'
import { idempotentResponse } from '@/lib/idempotency'
import { readJson } from '@/lib/request'
import { requireAdmin } from '@/modules/admin/api'
import { auditContext } from '@/modules/audit/audit'
import { refundPayment } from '@/modules/payments/refunds'

/** `{amountPaise, reason}`: refund part or all of a captured payment (idempotent, audited). */
export const POST = route<RouteContext<'/api/v1/admin/payments/[id]/refunds'>>(
  async (request, ctx, { requestId }) => {
    const admin = await requireAdmin(request)
    const { id } = await ctx.params
    const body = await readJson(request)
    return idempotentResponse(
      request,
      { userId: admin.userId, route: `POST /api/v1/admin/payments/${id}/refunds`, body },
      async () => ({
        status: 201,
        body: await refundPayment(admin, id, body, auditContext(request, requestId)),
      }),
    )
  },
)
