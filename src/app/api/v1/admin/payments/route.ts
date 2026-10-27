import { route } from '@/lib/http'
import { noStore, requireAdmin, searchParams } from '@/modules/admin/api'
import { listAdminPayments } from '@/modules/payments/refunds'

/** `?status=&provider=&q=<booking code>&page=` */
export const GET = route(async (request) => {
  await requireAdmin(request)
  return Response.json(await listAdminPayments(searchParams(request)), { headers: noStore })
})
