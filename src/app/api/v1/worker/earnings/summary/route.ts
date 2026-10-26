import { z } from 'zod'
import { route } from '@/lib/http'
import { earningsSummary, PERIODS } from '@/modules/ledger/earnings'
import { noStore, requireWorker } from '@/modules/workers/api'

const query = z.object({ period: z.enum(PERIODS).default('week') })

/** Gross, Kaamico fee, net, cash collected and balance (`?period=week|month|all`). Simulated payouts. */
export const GET = route(async (request) => {
  const actor = await requireWorker(request)
  const { period } = query.parse(Object.fromEntries(new URL(request.url).searchParams))
  return Response.json(await earningsSummary(actor.workerId, period), { headers: noStore })
})
