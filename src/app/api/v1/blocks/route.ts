import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { listBlocked } from '@/modules/favorites/blocks'

/** Professionals the customer has blocked. */
export const GET = route(async (request) => {
  const actor = await requireApiActor(request, { role: 'CUSTOMER' })
  return Response.json(
    { blocked: await listBlocked(actor) },
    { headers: { 'cache-control': 'no-store' } },
  )
})
