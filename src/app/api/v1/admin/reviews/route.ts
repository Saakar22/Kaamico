import { route } from '@/lib/http'
import { noStore, requireAdmin, searchParams } from '@/modules/admin/api'
import { listAdminReviews } from '@/modules/reviews/moderation'

/** `?status=FLAGGED|HIDDEN|PUBLISHED|ALL&page=`; reported reviews by default. */
export const GET = route(async (request) => {
  await requireAdmin(request)
  return Response.json(await listAdminReviews(searchParams(request)), { headers: noStore })
})
