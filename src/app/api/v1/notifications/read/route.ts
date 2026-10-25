import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { markRead } from '@/modules/notifications/notifications'

/** `{ids: [...]}` or `{all: true}`; only the user's own notifications change. */
export const POST = route(async (request) => {
  const actor = await requireApiActor(request)
  return Response.json(await markRead(actor.userId, await readJson(request)))
})
