import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { publicUser } from '@/modules/auth/responses'

// Reads the request's cookies, so it always runs at request time.
export const GET = route(async (request) => {
  const actor = await requireApiActor(request, { allowOnboarding: true })
  return Response.json({ user: publicUser(actor) }, { headers: { 'cache-control': 'no-store' } })
})
