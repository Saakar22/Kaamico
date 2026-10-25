import { Lock } from 'lucide-react'
import type { Metadata } from 'next'
import { VerificationPanel } from '@/components/domain/worker/verification-panel'
import { VerificationStatusCard } from '@/components/domain/worker/verification-status-card'
import { PageHeader } from '@/components/patterns/page-header'
import { getVerification } from '@/modules/verification/verification'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export const metadata: Metadata = { title: 'ID verification' }

export default async function WorkerVerificationPage() {
  const actor = await requireWorkerPage()
  const state = await getVerification(actor.workerId)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="ID verification"
        description="A Kaamico admin checks your ID before customers can book you."
      />
      <VerificationStatusCard state={state} />
      <p className="flex items-start gap-2 rounded-md bg-surface-muted px-3 py-2 text-sm text-ink-900">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-600" />
        Your documents are stored privately. Customers never see them; only Kaamico admins can open
        them, and every view is logged. We never store your full Aadhaar number.
      </p>
      <VerificationPanel state={state} />
    </div>
  )
}
