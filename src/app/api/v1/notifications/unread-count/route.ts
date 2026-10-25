import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { countUnread } from '@/modules/notifications/notifications'

/** Polled by the notification bell. */
export const GET = route(async (request) => {
  const actor = await requireApiActor(request)
  return Response.json(
    { unread: await countUnread(actor.userId) },
    { headers: { 'cache-control': 'no-store' } },
  )
})
