import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { simulatePayment } from '@/modules/payments/payments'

/** `{outcome: success|failure}` for a simulated checkout. Absent unless payments are simulated. */
export const POST = route<RouteContext<'/api/v1/payments/[id]/simulate'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  return Response.json(await simulatePayment(actor, (await ctx.params).id, await readJson(request)))
})
