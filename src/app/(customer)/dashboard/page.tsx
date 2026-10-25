import { CalendarCheck } from 'lucide-react'
import type { Metadata } from 'next'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Card } from '@/components/ui/card'
import { requirePageActor } from '@/modules/auth/page-guards'

// Session-dependent: always needs a server round trip, so opt out of instant validation.
export const instant = false

export const metadata: Metadata = { title: 'Your dashboard' }

// Placeholder until bookings arrive (IMPLEMENTATION_PLAN.md Phase 8).
export default async function CustomerDashboardPage() {
  const actor = await requirePageActor()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Hi, ${actor.name}`}
        description="Your bookings and offers will appear here."
        actions={<SignOutButton />}
      />
      <Card>
        <EmptyState
          icon={CalendarCheck}
          title="Booking is coming soon"
          description="You're signed in. Finding and booking professionals arrives in the next phases."
        />
      </Card>
    </div>
  )
}
