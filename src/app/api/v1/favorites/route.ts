import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { listFavorites } from '@/modules/favorites/favorites'

/** The customer's saved professionals who can still be booked. */
export const GET = route(async (request) => {
  const actor = await requireApiActor(request, { role: 'CUSTOMER' })
  return Response.json(
    { favorites: await listFavorites(actor) },
    { headers: { 'cache-control': 'no-store' } },
  )
})
