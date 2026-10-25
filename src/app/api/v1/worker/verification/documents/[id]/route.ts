import { route } from '@/lib/http'
import { removeDocument } from '@/modules/verification/verification'
import { requireWorker } from '@/modules/workers/api'

export const DELETE = route<RouteContext<'/api/v1/worker/verification/documents/[id]'>>(
  async (request, ctx) => {
    const actor = await requireWorker(request)
    await removeDocument(actor, (await ctx.params).id)
    return new Response(null, { status: 204 })
  },
)
