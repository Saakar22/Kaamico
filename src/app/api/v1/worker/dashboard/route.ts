import { route } from '@/lib/http'
import { getVerification } from '@/modules/verification/verification'
import { noStore, requireWorker } from '@/modules/workers/api'
import { getOnboardingState } from '@/modules/workers/onboarding'
import { getStatus } from '@/modules/workers/status'

/** Setup checklist, online status and verification summary (requests and jobs: Phase 8). */
export const GET = route(async (request) => {
  const actor = await requireWorker(request)
  const [onboarding, status, verification] = await Promise.all([
    getOnboardingState(actor.workerId),
    getStatus(actor.workerId),
    getVerification(actor.workerId),
  ])
  return Response.json(
    {
      onboarding,
      status,
      verification: {
        status: verification.application?.status ?? null,
        decisionReason: verification.application?.decisionReason ?? null,
      },
    },
    { headers: noStore },
  )
})
