import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireAdmin } from '@/modules/admin/api'
import { createService } from '@/modules/admin/catalog'
import { auditContext } from '@/modules/audit/audit'

export const POST = route(async (request, _ctx, { requestId }) => {
  const admin = await requireAdmin(request)
  const service = await createService(
    admin,
    await readJson(request),
    auditContext(request, requestId),
  )
  return Response.json({ service }, { status: 201 })
})
