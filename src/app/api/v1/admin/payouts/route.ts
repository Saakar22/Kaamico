import { route } from '@/lib/http'
import { noStore, requireAdmin, searchParams } from '@/modules/admin/api'
import { listAdminPayouts } from '@/modules/ledger/payouts'

/** `?status=REQUESTED|PROCESSING|PAID|FAILED|OPEN&page=` */
export const GET = route(async (request) => {
  await requireAdmin(request)
  return Response.json(await listAdminPayouts(searchParams(request)), { headers: noStore })
})
