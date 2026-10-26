import { z } from 'zod'
import { route } from '@/lib/http'
import { noStore, requireAdmin, searchParams } from '@/modules/admin/api'
import { listVerificationQueue, QUEUE_TABS } from '@/modules/admin/verifications'

const query = z.object({
  tab: z.enum(QUEUE_TABS).default('pending'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
})

/** The review queue: `?tab=pending|resubmission|approved|rejected&page=`. */
export const GET = route(async (request) => {
  await requireAdmin(request)
  const { tab, page } = query.parse(searchParams(request))
  return Response.json(await listVerificationQueue(tab, page), { headers: noStore })
})
