import type { Metadata } from 'next'
import Link from 'next/link'
import { OnboardingChecklist } from '@/components/domain/worker/onboarding-checklist'
import { PageHeader } from '@/components/patterns/page-header'
import { Button } from '@/components/ui/button'
import { brand } from '@/config/brand'
import { getOnboardingState } from '@/modules/workers/onboarding'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export const metadata: Metadata = { title: 'Set up your professional profile' }

/** The setup checklist; "Continue" always goes to the first unfinished step. */
export default async function WorkerOnboardingPage() {
  const actor = await requireWorkerPage()
  const state = await getOnboardingState(actor.workerId)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Set up your profile"
        description={`${brand.campaignLine}. A few steps and customers near you can find you.`}
      />
      <p className="text-ink-600" aria-live="polite">
        {state.completed} of {state.steps.length} steps done
      </p>
      <OnboardingChecklist state={state} />
      {state.next ? (
        <Button asChild className="self-start">
          <Link href={state.next.href}>Continue: {state.next.title}</Link>
        </Button>
      ) : (
        <Button asChild variant="secondary" className="self-start">
          <Link href="/worker/dashboard">Go to your dashboard</Link>
        </Button>
      )}
    </div>
  )
}
