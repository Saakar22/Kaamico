import { route } from '@/lib/http'
import { listPayouts } from '@/modules/ledger/earnings'
import { noStore, requireWorker } from '@/modules/workers/api'

/** Payouts so far. All are simulated in this release. */
export const GET = route(async (request) => {
  const actor = await requireWorker(request)
  return Response.json({ payouts: await listPayouts(actor.workerId) }, { headers: noStore })
})
