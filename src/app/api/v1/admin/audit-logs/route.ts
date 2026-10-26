import { route } from '@/lib/http'
import { noStore, requireAdmin, searchParams } from '@/modules/admin/api'
import { listAuditLogs } from '@/modules/audit/audit'

/** Read-only, newest first: `?action&entityType&entityId&page`. No write endpoints exist. */
export const GET = route(async (request) => {
  await requireAdmin(request)
  return Response.json(await listAuditLogs(searchParams(request)), { headers: noStore })
})
