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
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { RateList, RateRow } from '@/components/patterns/rate-list'
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
        actions={<SignOutButton variant="tertiary" size="sm" />}
      />

      {verified ? (
        // The professional's money and workload at a glance, with going online beside it.
        <section
          aria-label={t('wdash.earnedWeek')}
          className="grid gap-6 rounded-xl bg-night p-5 text-on-night shadow-[var(--shadow-float)] sm:p-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10"
        >
          <div className="flex flex-col gap-6">
            <Link href="/worker/earnings" className="group flex flex-col gap-1 self-start">
              <span className="text-on-night-muted group-hover:text-on-night">
                {t('wdash.earnedWeek')}
              </span>
              <Money
                paise={earnings.netPaise}
                className="font-display text-5xl leading-none font-semibold sm:text-6xl"
              />
              <span className="text-sm text-on-night-muted">{t('wdash.afterFee')}</span>
            </Link>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <Link
                href="/worker/requests"
                className={cn(
                  'flex flex-col gap-1 rounded-lg p-3 transition-colors motion-reduce:transition-none sm:p-4',
                  // Marigold when someone is waiting on a reply.
                  jobs.requestsAwaitingReply > 0
                    ? 'bg-accent-500 text-on-accent hover:bg-accent-600'
                    : 'bg-night-raised hover:bg-on-night/15',
                )}
              >
                <span className="text-xs leading-tight sm:text-sm">{t('wdash.awaiting')}</span>
                <span className="font-display text-3xl font-semibold tabular-nums">
                  {jobs.requestsAwaitingReply}
                </span>
              </Link>
              <div className="flex flex-col gap-1 rounded-lg bg-night-raised p-3 sm:p-4">
                <span className="text-xs leading-tight text-on-night-muted sm:text-sm">
                  {t('wdash.jobsToday')}
                </span>
                <span className="font-display text-3xl font-semibold tabular-nums">
                  {jobs.today.length}
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-lg bg-night-raised p-3 sm:p-4">
                <span className="text-xs leading-tight text-on-night-muted sm:text-sm">
                  {t('wdash.doneWeek')}
                </span>
                <span className="font-display text-3xl font-semibold tabular-nums">
                  {jobs.week.completedJobs}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {SETTINGS.slice(0, 3).map((s) => (
                <Button key={s.href} asChild variant="night" size="sm">
                  <Link href={s.href}>
                    <s.icon aria-hidden="true" />
                    {t(s.label)}
                  </Link>
                </Button>
              ))}
            </div>
          </div>
          <div className="self-start rounded-lg bg-surface p-5 text-ink-900">
            <OnlineToggle status={status} verified={verified} />
          </div>
        </section>
      ) : (
        <div className="rounded-xl bg-mist p-5">
          <OnlineToggle status={status} verified={verified} />
        </div>
      )}

      {verified && (
        <section aria-labelledby="today-title" className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <h2 id="today-title" className="font-display text-2xl font-semibold">
              {t('wdash.todaysJobs')}
            </h2>
            <Link
              href="/worker/bookings?tab=upcoming"
              className="text-sm font-semibold text-brand-700 hover:underline"
            >
              {t('wdash.upcoming')}
            </Link>
          </div>
          {jobs.today.length === 0 ? (
            <p className="rounded-xl bg-mist px-5 py-6 text-ink-600">{t('wdash.noJobs')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl bg-surface px-4 shadow-[var(--shadow-lift)] ring-1 ring-border sm:px-6">
              {jobs.today.map((j) => (
                <li key={j.id}>
                  <JobCard job={j} />
                </li>
              ))}
            </ul>
          )}
        </section>
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
        <RateList className="sm:grid sm:grid-cols-2 sm:gap-x-10 sm:border-t-0">
          {SETTINGS.map((s) => (
            <RateRow
              key={s.href}
              href={s.href}
              className="sm:[&:nth-child(-n+2)]:border-t"
              leading={<s.icon aria-hidden="true" className="size-5 text-brand-700" />}
              label={t(s.label)}
            />
          ))}
          {verified && (
            <RateRow
              href={`/professionals/${actor.workerId}`}
              leading={<MapPin aria-hidden="true" className="size-5 text-brand-700" />}
              label={t('wdash.publicProfile')}
            />
          )}
        </RateList>
      </section>
    </div>
  )
}
