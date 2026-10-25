import { route } from '@/lib/http'
import { getVerification } from '@/modules/verification/verification'
import { noStore, requireWorker } from '@/modules/workers/api'

/** Application status and document metadata. Never storage keys or file links. */
export const GET = route(async (request) => {
  const actor = await requireWorker(request)
  return Response.json(await getVerification(actor.workerId), { headers: noStore })
})
