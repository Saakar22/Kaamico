import {
  CalendarClock,
  IndianRupee,
  LifeBuoy,
  MapPin,
  ShieldCheck,
  Star,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { AutoRefresh } from '@/components/domain/booking/auto-refresh'
import { JobCard } from '@/components/domain/booking/booking-list-item'
import { OnboardingChecklist } from '@/components/domain/worker/onboarding-checklist'
import { OnlineToggle } from '@/components/domain/worker/online-toggle'
import { VerificationStatusCard } from '@/components/domain/worker/verification-status-card'
import { PageHeader } from '@/components/patterns/page-header'
import { StatTile } from '@/components/patterns/stat-tile'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import { getWorkerJobSummary } from '@/modules/bookings/lists'
import { earningsSummary } from '@/modules/ledger/earnings'
import { getVerification } from '@/modules/verification/verification'
import { getOnboardingState } from '@/modules/workers/onboarding'
import { requireWorkerPage } from '@/modules/workers/page-guard'
import { getStatus } from '@/modules/workers/status'

// Session-dependent: always needs a server round trip, so opt out of instant validation.
export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('wdash.metaTitle') }
}

const SETTINGS: { href: string; label: MessageKey; icon: LucideIcon }[] = [
  { href: '/worker/profile', label: 'wdash.profile', icon: UserRound },
  { href: '/worker/pricing', label: 'wdash.prices', icon: IndianRupee },
  { href: '/worker/availability', label: 'wdash.hours', icon: CalendarClock },
  { href: '/worker/verification', label: 'wdash.verification', icon: ShieldCheck },
  { href: '/worker/reviews', label: 'wdash.reviews', icon: Star },
  { href: '/worker/support', label: 'wdash.help', icon: LifeBuoy },
]

export default async function WorkerDashboardPage() {
  const actor = await requireWorkerPage()
  const [onboarding, status, verification, jobs, earnings, t] = await Promise.all([
    getOnboardingState(actor.workerId),
    getStatus(actor.workerId),
    getVerification(actor.workerId),
    getWorkerJobSummary(actor),
    earningsSummary(actor.workerId, 'week'),
    getT(),
  ])
  const setupDone = onboarding.next === null
  const verified = status.verificationStatus === 'VERIFIED'

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh intervalMs={15_000} enabled={verified} />
      <PageHeader
        title={t('dashboard.hi', { name: actor.name ?? '' })}
        description={
          !setupDone
            ? t('wdash.setupProgress', {
                done: onboarding.completed,
                total: onboarding.steps.length,
              })
            : jobs.requestsAwaitingReply > 0
              ? t(jobs.requestsAwaitingReply === 1 ? 'wdash.waitingOne' : 'wdash.waitingOther', {
                  count: jobs.requestsAwaitingReply,
                })
              : t('wdash.glance')
        }
        actions={<SignOutButton />}
      />

      <Card>
        <CardContent>
          <OnlineToggle status={status} verified={verified} />
        </CardContent>
      </Card>

      {verified && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Link href="/worker/requests" className="rounded-lg hover:ring-2 hover:ring-brand-600">
              <StatTile
                label={t('wdash.awaiting')}
                value={jobs.requestsAwaitingReply}
                className={jobs.requestsAwaitingReply > 0 ? 'border-accent-500' : undefined}
              />
            </Link>
            <StatTile label={t('wdash.jobsToday')} value={jobs.today.length} />
            <StatTile label={t('wdash.doneWeek')} value={jobs.week.completedJobs} />
            <Link href="/worker/earnings" className="rounded-lg hover:ring-2 hover:ring-brand-600">
              <StatTile
                label={t('wdash.earnedWeek')}
                value={<Money paise={earnings.netPaise} />}
                hint={t('wdash.afterFee')}
              />
            </Link>
          </div>

          <section aria-labelledby="today-title" className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <h2 id="today-title" className="font-display text-xl font-semibold">
                {t('wdash.todaysJobs')}
              </h2>
              <Link
                href="/worker/bookings?tab=upcoming"
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                {t('wdash.upcoming')}
              </Link>
            </div>
            {jobs.today.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-ink-600">
                {t('wdash.noJobs')}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border border-y border-border">
                {jobs.today.map((j) => (
                  <li key={j.id}>
                    <JobCard job={j} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <VerificationStatusCard state={verification} />

      {!setupDone && (
        <section aria-labelledby="setup-title" className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <h2 id="setup-title" className="font-display text-xl font-semibold">
              {t('wdash.finishSetup')}
            </h2>
            {onboarding.next && (
              <Button asChild size="sm">
                <Link href={onboarding.next.href}>
                  {t('wdash.continueStep', {
                    step: t(`onboard.${onboarding.next.key}Title` as MessageKey),
                  })}
                </Link>
              </Button>
            )}
          </div>
          <OnboardingChecklist state={onboarding} />
        </section>
      )}

      <section aria-labelledby="settings-title" className="flex flex-col gap-3">
        <h2 id="settings-title" className="font-display text-xl font-semibold">
          {t('wdash.yourSetup')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SETTINGS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface px-4 hover:border-brand-600"
              >
                <s.icon aria-hidden="true" className="size-5 text-brand-700" />
                <span className="font-medium">{t(s.label)}</span>
              </Link>
            </li>
          ))}
          {verified && (
            <li>
              <Link
                href={`/professionals/${actor.workerId}`}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface px-4 hover:border-brand-600"
              >
                <MapPin aria-hidden="true" className="size-5 text-brand-700" />
                <span className="font-medium">{t('wdash.publicProfile')}</span>
              </Link>
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}
