import { route } from '@/lib/http'
import { listLedger } from '@/modules/ledger/earnings'
import { noStore, requireWorker } from '@/modules/workers/api'

/** Ledger entries, newest first (`?cursor=` the last id seen). */
export const GET = route(async (request) => {
  const actor = await requireWorker(request)
  const cursor = new URL(request.url).searchParams.get('cursor')
  return Response.json(await listLedger(actor.workerId, cursor), { headers: noStore })
})
