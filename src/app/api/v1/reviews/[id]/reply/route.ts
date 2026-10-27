import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { replyToReview } from '@/modules/reviews/moderation'

/** `{reply}`: the reviewed professional answers once (§10.10). */
export const POST = route<RouteContext<'/api/v1/reviews/[id]/reply'>>(async (request, ctx) => {
  const actor = await requireApiActor(request, { role: 'WORKER' })
  return Response.json(await replyToReview(actor, (await ctx.params).id, await readJson(request)))
})
