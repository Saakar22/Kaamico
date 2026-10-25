import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { getCustomerDashboard } from '@/modules/bookings/lists'

/** The customer's action inbox: offers and charges to answer, the active booking, rebooking. */
export const GET = route(async (request) => {
  const actor = await requireApiActor(request)
  return Response.json(await getCustomerDashboard(actor), {
    headers: { 'cache-control': 'no-store' },
  })
})
