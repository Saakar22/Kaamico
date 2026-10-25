import { route } from '@/lib/http'
import { idempotencyKeyFrom, withIdempotency } from '@/lib/idempotency'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { completeOnboarding, onboardingInput } from '@/modules/auth/onboarding'

export const POST = route(async (request) => {
  const actor = await requireApiActor(request, { allowOnboarding: true })
  const key = idempotencyKeyFrom(request)
  const raw = await readJson(request)
  const input = onboardingInput.parse(raw)

  const result = await withIdempotency(
    { userId: actor.userId, key, route: 'POST /api/v1/me/onboarding', body: input },
    async () => ({ status: 200, body: await completeOnboarding(actor, input) }),
  )
  return Response.json(result.body, {
    status: result.status,
    headers: result.replayed ? { 'idempotent-replayed': 'true' } : {},
  })
})
