import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { removeFavorite, saveFavorite } from '@/modules/favorites/favorites'

type Ctx = RouteContext<'/api/v1/favorites/[workerId]'>

/** Save a professional (idempotent). */
export const PUT = route<Ctx>(async (request, ctx) => {
  const actor = await requireApiActor(request, { role: 'CUSTOMER' })
  return Response.json(await saveFavorite(actor, (await ctx.params).workerId))
})

/** Remove a saved professional (idempotent). */
export const DELETE = route<Ctx>(async (request, ctx) => {
  const actor = await requireApiActor(request, { role: 'CUSTOMER' })
  return Response.json(await removeFavorite(actor, (await ctx.params).workerId))
})
