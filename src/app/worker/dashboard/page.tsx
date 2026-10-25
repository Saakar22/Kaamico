import { ClipboardCheck } from 'lucide-react'
import type { Metadata } from 'next'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Card } from '@/components/ui/card'
import { requirePageActor } from '@/modules/auth/page-guards'

// Session-dependent: always needs a server round trip, so opt out of instant validation.
export const instant = false

export const metadata: Metadata = { title: 'Professional dashboard' }

// Placeholder until onboarding, requests and jobs arrive (Phases 6–8).
export default async function WorkerDashboardPage() {
  const actor = await requirePageActor('WORKER')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Hi, ${actor.name}`}
        description="Your requests, jobs and earnings will appear here."
        actions={<SignOutButton />}
      />
      <Card>
        <EmptyState
          icon={ClipboardCheck}
          title="Your professional profile is next"
          description="Setting up your skills, prices, hours and ID verification arrives in the next phases."
        />
      </Card>
    </div>
  )
}
