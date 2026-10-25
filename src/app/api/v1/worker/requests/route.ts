import { z } from 'zod'
import { route } from '@/lib/http'
import { queryParams } from '@/lib/request'
import { listWorkerRequests } from '@/modules/bookings/views'
import { noStore, requireWorker } from '@/modules/workers/api'

/** The inbox: `?state=new|negotiating|missed`. Addresses are never included. */
export const GET = route(async (request) => {
  const actor = await requireWorker(request)
  const { state } = z
    .object({ state: z.enum(['new', 'negotiating', 'missed']).default('new') })
    .parse(queryParams(request))
  return Response.json({ requests: await listWorkerRequests(actor, state) }, { headers: noStore })
})
