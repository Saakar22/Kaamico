import { route } from '@/lib/http'
import { listPayouts, payoutAvailability } from '@/modules/ledger/payouts'
import { noStore, requireWorker } from '@/modules/workers/api'

/** Payouts so far and what can be paid out now. All payouts are simulated in this release. */
export const GET = route(async (request) => {
  const actor = await requireWorker(request)
  const [payouts, availability] = await Promise.all([
    listPayouts(actor.workerId),
    payoutAvailability(actor.workerId),
  ])
  return Response.json({ payouts, availability }, { headers: noStore })
})
