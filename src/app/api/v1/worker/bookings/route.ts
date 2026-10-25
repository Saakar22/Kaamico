import { z } from 'zod'
import { route } from '@/lib/http'
import { listWorkerJobs, WORKER_TABS } from '@/modules/bookings/lists'
import { noStore, requireWorker } from '@/modules/workers/api'

const listQuery = z.object({
  tab: z.enum(WORKER_TABS).default('today'),
  cursor: z.string().max(200).optional(),
})

/** Assigned jobs: `?tab=today|upcoming|completed|cancelled&cursor=…`. */
export const GET = route(async (request) => {
  const actor = await requireWorker(request)
  const query = listQuery.parse(Object.fromEntries(new URL(request.url).searchParams))
  return Response.json(await listWorkerJobs(actor, query), { headers: noStore })
})
