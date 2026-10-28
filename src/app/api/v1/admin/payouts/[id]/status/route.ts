import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireAdmin } from '@/modules/admin/api'
import { auditContext } from '@/modules/audit/audit'
import { setPayoutStatus } from '@/modules/ledger/payouts'

/** `{status: PROCESSING|PAID|FAILED, reason?}`: move a payout on (audited; reason required to fail). */
export const POST = route<RouteContext<'/api/v1/admin/payouts/[id]/status'>>(
  async (request, ctx, { requestId }) => {
    const admin = await requireAdmin(request)
    const { id } = await ctx.params
    const body = await readJson(request)
    const payout = await setPayoutStatus(admin, id, body, auditContext(request, requestId))
    return Response.json(payout, { headers: { 'cache-control': 'no-store' } })
  },
)
