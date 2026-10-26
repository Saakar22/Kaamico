import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireAdmin } from '@/modules/admin/api'
import { adminCancelBooking } from '@/modules/admin/bookings'
import { auditContext } from '@/modules/audit/audit'

/** `{reason, expectedVersion}`: cancels any non-terminal booking; both sides are notified. */
export const POST = route<RouteContext<'/api/v1/admin/bookings/[id]/cancel'>>(
  async (request, ctx, { requestId }) => {
    const admin = await requireAdmin(request)
    const result = await adminCancelBooking(
      admin,
      (await ctx.params).id,
      await readJson(request),
      auditContext(request, requestId),
    )
    return Response.json(result)
  },
)
