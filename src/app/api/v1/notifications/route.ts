import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { listNotifications } from '@/modules/notifications/notifications'

/** The signed-in user's notifications, newest first (`?cursor` for the next page). */
export const GET = route(async (request) => {
  const actor = await requireApiActor(request)
  const cursor = new URL(request.url).searchParams.get('cursor')
  return Response.json(await listNotifications(actor.userId, { cursor }), {
    headers: { 'cache-control': 'no-store' },
  })
})
