import { route } from '@/lib/http'
import { getWorkerJobSummary } from '@/modules/bookings/lists'
import { getVerification } from '@/modules/verification/verification'
import { noStore, requireWorker } from '@/modules/workers/api'
import { getOnboardingState } from '@/modules/workers/onboarding'
import { getStatus } from '@/modules/workers/status'

/** Setup checklist, online status, verification summary, today's jobs and this week's numbers. */
export const GET = route(async (request) => {
  const actor = await requireWorker(request)
  const [onboarding, status, verification, jobs] = await Promise.all([
    getOnboardingState(actor.workerId),
    getStatus(actor.workerId),
    getVerification(actor.workerId),
    getWorkerJobSummary(actor),
  ])
  return Response.json(
    {
      onboarding,
      status,
      verification: {
        status: verification.application?.status ?? null,
        decisionReason: verification.application?.decisionReason ?? null,
      },
      jobs,
    },
    { headers: noStore },
  )
})
