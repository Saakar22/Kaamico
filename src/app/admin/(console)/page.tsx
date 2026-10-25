import { LayoutDashboard } from 'lucide-react'
import type { Metadata } from 'next'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Card } from '@/components/ui/card'
import { requirePageActor } from '@/modules/auth/page-guards'

// Session-dependent: always needs a server round trip, so opt out of instant validation.
export const instant = false

export const metadata: Metadata = { title: 'Admin overview' }

// Placeholder until the admin console is built (Phase 9).
export default async function AdminOverviewPage() {
  const actor = await requirePageActor('ADMIN')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Admin overview"
        description={`Signed in as ${actor.email ?? actor.name ?? 'admin'}. Admin sessions last 8 hours.`}
        actions={<SignOutButton redirectTo="/admin/login" />}
      />
      <Card>
        <EmptyState
          icon={LayoutDashboard}
          title="The admin console is coming soon"
          description="Verification review, bookings and the audit log arrive in Phase 9."
        />
      </Card>
    </div>
  )
}
