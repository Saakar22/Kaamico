import { Lock } from 'lucide-react'
import type { Metadata } from 'next'
import { VerificationPanel } from '@/components/domain/worker/verification-panel'
import { VerificationStatusCard } from '@/components/domain/worker/verification-status-card'
import { PageHeader } from '@/components/patterns/page-header'
import { getT } from '@/i18n/server'
import { getVerification } from '@/modules/verification/verification'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('wverify.metaTitle') }
}

export default async function WorkerVerificationPage() {
  const actor = await requireWorkerPage()
  const [state, t] = await Promise.all([getVerification(actor.workerId), getT()])
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('wverify.title')} description={t('wverify.description')} />
      <VerificationStatusCard state={state} />
      <p className="flex items-start gap-2 rounded-md bg-surface-muted px-3 py-2 text-sm text-ink-900">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-600" />
        {t('wverify.privacy')}
      </p>
      <VerificationPanel state={state} />
    </div>
  )
}
