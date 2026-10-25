import { route } from '@/lib/http'
import { idempotencyKeyFrom, withIdempotency } from '@/lib/idempotency'
import { submitApplication } from '@/modules/verification/verification'
import { requireWorker } from '@/modules/workers/api'

/** Submits for review (idempotent: a retried request returns the stored result). */
export const POST = route(async (request) => {
  const actor = await requireWorker(request)
  const key = idempotencyKeyFrom(request)
  const result = await withIdempotency(
    { userId: actor.userId, key, route: 'POST /api/v1/worker/verification/submit', body: null },
    async () => ({ status: 200, body: await submitApplication(actor) }),
  )
  return Response.json(result.body, {
    status: result.status,
    headers: {
      'cache-control': 'no-store',
      ...(result.replayed ? { 'idempotent-replayed': 'true' } : {}),
    },
  })
})
