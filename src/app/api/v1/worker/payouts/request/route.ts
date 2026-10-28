import { route } from '@/lib/http'
import { idempotentResponse } from '@/lib/idempotency'
import { readJson } from '@/lib/request'
import { requestPayout } from '@/modules/ledger/payouts'
import { requireWorker } from '@/modules/workers/api'

/** `{amountPaise}`: ask for a payout of the available balance (idempotent; simulated). */
export const POST = route(async (request) => {
  const actor = await requireWorker(request)
  const body = await readJson(request)
  return idempotentResponse(
    request,
    { userId: actor.userId, route: 'POST /api/v1/worker/payouts/request', body },
    async () => ({ status: 201, body: await requestPayout(actor, body) }),
  )
})
