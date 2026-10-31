import type { Metadata } from 'next'
import Link from 'next/link'
import { OnboardingChecklist } from '@/components/domain/worker/onboarding-checklist'
import { PageHeader } from '@/components/patterns/page-header'
import { Button } from '@/components/ui/button'
import { brand } from '@/config/brand'
import { getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import { getOnboardingState } from '@/modules/workers/onboarding'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('onboard.metaTitle') }
}

/** The setup checklist; "Continue" always goes to the first unfinished step. */
export default async function WorkerOnboardingPage() {
  const actor = await requireWorkerPage()
  const [state, t] = await Promise.all([getOnboardingState(actor.workerId), getT()])
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('onboard.title')}
        description={t('onboard.description', { campaign: brand.campaignLine })}
      />
      <p className="text-ink-600" aria-live="polite">
        {t('onboard.progress', { done: state.completed, total: state.steps.length })}
      </p>
      <OnboardingChecklist state={state} />
      {state.next ? (
        <Button asChild className="self-start">
          <Link href={state.next.href}>
            {t('onboard.continue', { step: t(`onboard.${state.next.key}Title` as MessageKey) })}
          </Link>
        </Button>
      ) : (
        <Button asChild variant="secondary" className="self-start">
          <Link href="/worker/dashboard">{t('onboard.dashboard')}</Link>
        </Button>
      )}
    </div>
  )
}
