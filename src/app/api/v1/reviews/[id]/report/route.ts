import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { reportReview } from '@/modules/reviews/moderation'

/** `{reason}`: the professional or the customer asks Kaamico to check a review. */
export const POST = route<RouteContext<'/api/v1/reviews/[id]/report'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  return Response.json(await reportReview(actor, (await ctx.params).id, await readJson(request)))
})
