import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { blockWorker, unblockWorker } from '@/modules/favorites/blocks'

type Ctx = RouteContext<'/api/v1/blocks/[workerId]'>

/** Block a professional (idempotent; also unsaves them). */
export const PUT = route<Ctx>(async (request, ctx) => {
  const actor = await requireApiActor(request, { role: 'CUSTOMER' })
  return Response.json(await blockWorker(actor, (await ctx.params).workerId))
})

/** Unblock a professional (idempotent). */
export const DELETE = route<Ctx>(async (request, ctx) => {
  const actor = await requireApiActor(request, { role: 'CUSTOMER' })
  return Response.json(await unblockWorker(actor, (await ctx.params).workerId))
})
