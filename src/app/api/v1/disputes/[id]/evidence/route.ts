import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { addEvidence } from '@/modules/disputes/disputes'

/** `{note}`: either party adds information while the report is open. */
export const POST = route<RouteContext<'/api/v1/disputes/[id]/evidence'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  const note = await addEvidence(actor, (await ctx.params).id, await readJson(request))
  return Response.json({ note }, { status: 201 })
})
