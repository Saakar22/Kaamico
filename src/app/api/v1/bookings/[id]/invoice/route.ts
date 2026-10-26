import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { getReceipt } from '@/modules/payments/receipts'

/** The booking receipt: its customer, its professional or an admin (not a tax invoice). */
export const GET = route<RouteContext<'/api/v1/bookings/[id]/invoice'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  return Response.json(
    { receipt: await getReceipt(actor, (await ctx.params).id) },
    { headers: { 'cache-control': 'no-store' } },
  )
})
