import {
  CalendarClock,
  IndianRupee,
  MapPin,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { OnboardingChecklist } from '@/components/domain/worker/onboarding-checklist'
import { OnlineToggle } from '@/components/domain/worker/online-toggle'
import { VerificationStatusCard } from '@/components/domain/worker/verification-status-card'
import { PageHeader } from '@/components/patterns/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getVerification } from '@/modules/verification/verification'
import { getOnboardingState } from '@/modules/workers/onboarding'
import { requireWorkerPage } from '@/modules/workers/page-guard'
import { getStatus } from '@/modules/workers/status'

// Session-dependent: always needs a server round trip, so opt out of instant validation.
export const instant = false

export const metadata: Metadata = { title: 'Professional dashboard' }

const SETTINGS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/worker/profile', label: 'Profile and skills', icon: UserRound },
  { href: '/worker/pricing', label: 'Your prices', icon: IndianRupee },
  { href: '/worker/availability', label: 'Hours and work area', icon: CalendarClock },
  { href: '/worker/verification', label: 'ID verification', icon: ShieldCheck },
]

export default async function WorkerDashboardPage() {
  const actor = await requireWorkerPage()
  const [onboarding, status, verification] = await Promise.all([
    getOnboardingState(actor.workerId),
    getStatus(actor.workerId),
    getVerification(actor.workerId),
  ])
  const setupDone = onboarding.next === null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Hi, ${actor.name}`}
        description={
          setupDone
            ? 'Requests and jobs will appear here.'
            : `${onboarding.completed} of ${onboarding.steps.length} setup steps done.`
        }
        actions={<SignOutButton />}
      />

      <Card>
        <CardContent>
          <OnlineToggle status={status} verified={status.verificationStatus === 'VERIFIED'} />
        </CardContent>
      </Card>

      <VerificationStatusCard state={verification} />

      {!setupDone && (
        <section aria-labelledby="setup-title" className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <h2 id="setup-title" className="font-display text-xl font-bold">
              Finish setting up
            </h2>
            {onboarding.next && (
              <Button asChild size="sm">
                <Link href={onboarding.next.href}>Continue: {onboarding.next.title}</Link>
              </Button>
            )}
          </div>
          <OnboardingChecklist state={onboarding} />
        </section>
      )}

      <section aria-labelledby="settings-title" className="flex flex-col gap-3">
        <h2 id="settings-title" className="font-display text-xl font-bold">
          Your setup
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SETTINGS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface px-4 hover:border-brand-600"
              >
                <s.icon aria-hidden="true" className="size-5 text-brand-700" />
                <span className="font-medium">{s.label}</span>
              </Link>
            </li>
          ))}
          {status.verificationStatus === 'VERIFIED' && (
            <li>
              <Link
                href={`/professionals/${actor.workerId}`}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface px-4 hover:border-brand-600"
              >
                <MapPin aria-hidden="true" className="size-5 text-brand-700" />
                <span className="font-medium">See your public profile</span>
              </Link>
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}
