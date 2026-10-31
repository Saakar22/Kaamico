import { BriefcaseBusiness } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { JobCard } from '@/components/domain/booking/booking-list-item'
import { LinkTabs } from '@/components/patterns/link-tabs'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getLocale, getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import { listWorkerJobs, WORKER_TABS, type WorkerTab } from '@/modules/bookings/lists'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('wjobs.metaTitle') }
}

const LABELS: Record<WorkerTab, MessageKey> = {
  today: 'wjobs.tabToday',
  upcoming: 'wjobs.tabUpcoming',
  completed: 'wjobs.tabCompleted',
  cancelled: 'wjobs.tabCancelled',
}

const EMPTY: Record<WorkerTab, MessageKey> = {
  today: 'wjobs.emptyToday',
  upcoming: 'wjobs.emptyUpcoming',
  completed: 'wjobs.emptyCompleted',
  cancelled: 'wjobs.emptyCancelled',
}

export default async function WorkerJobsPage({
  searchParams,
}: PageProps<'/[lang]/worker/bookings'>) {
  const actor = await requireWorkerPage()
  const { tab: rawTab, cursor: rawCursor } = await searchParams
  const tab = WORKER_TABS.find((t) => t === rawTab) ?? 'today'
  const cursor = typeof rawCursor === 'string' ? rawCursor : null
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const { jobs, nextCursor } = await listWorkerJobs(actor, { tab, cursor }, new Date(), locale)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('wjobs.title')} description={t('wjobs.description')} />
      <LinkTabs
        label={t('wjobs.tabs')}
        current={tab}
        tabs={WORKER_TABS.map((key) => ({
          key,
          label: t(LABELS[key]),
          href: `/worker/bookings?tab=${key}`,
        }))}
      />
      {jobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={BriefcaseBusiness}
            title={cursor ? t('wjobs.noMore') : t('wreq.nothing')}
            description={t(EMPTY[tab])}
            action={
              tab === 'today' ? (
                <Button asChild variant="secondary">
                  <Link href="/worker/requests">{t('wjobs.seeRequests')}</Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul
          className="flex flex-col divide-y divide-border rounded-xl bg-surface px-4 shadow-[var(--shadow-lift)] ring-1 ring-border sm:px-6"
          aria-label={t('wjobs.listLabel', { tab: t(LABELS[tab]) })}
        >
          {jobs.map((j) => (
            <li key={j.id}>
              <JobCard job={j} />
            </li>
          ))}
        </ul>
      )}
      {nextCursor && (
        <Button asChild variant="secondary" className="self-center">
          <Link href={`/worker/bookings?tab=${tab}&cursor=${nextCursor}`}>
            {t('wjobs.showMore')}
          </Link>
        </Button>
      )}
    </div>
  )
}
