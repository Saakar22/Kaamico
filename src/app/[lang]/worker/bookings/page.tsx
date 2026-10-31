import { BriefcaseBusiness } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { JobCard } from '@/components/domain/booking/booking-list-item'
import { LinkTabs } from '@/components/patterns/link-tabs'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { listWorkerJobs, WORKER_TABS, type WorkerTab } from '@/modules/bookings/lists'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export const metadata: Metadata = { title: 'Jobs' }

const LABELS: Record<WorkerTab, string> = {
  today: 'Today',
  upcoming: 'Upcoming',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const EMPTY: Record<WorkerTab, string> = {
  today: 'Jobs for today, and any you have started, appear here.',
  upcoming: 'Confirmed jobs for later days appear here.',
  completed: 'Finished jobs appear here.',
  cancelled: 'Confirmed jobs that were cancelled appear here.',
}

export default async function WorkerJobsPage({
  searchParams,
}: PageProps<'/[lang]/worker/bookings'>) {
  const actor = await requireWorkerPage()
  const { tab: rawTab, cursor: rawCursor } = await searchParams
  const tab = WORKER_TABS.find((t) => t === rawTab) ?? 'today'
  const cursor = typeof rawCursor === 'string' ? rawCursor : null
  const { jobs, nextCursor } = await listWorkerJobs(actor, { tab, cursor })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Jobs" description="Confirmed work, with the price already agreed." />
      <LinkTabs
        label="Job types"
        current={tab}
        tabs={WORKER_TABS.map((t) => ({
          key: t,
          label: LABELS[t],
          href: `/worker/bookings?tab=${t}`,
        }))}
      />
      {jobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={BriefcaseBusiness}
            title={cursor ? 'No more jobs' : 'Nothing here yet'}
            description={EMPTY[tab]}
            action={
              tab === 'today' ? (
                <Button asChild variant="secondary">
                  <Link href="/worker/requests">See requests</Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={`${LABELS[tab]} jobs`}>
          {jobs.map((j) => (
            <li key={j.id}>
              <JobCard job={j} />
            </li>
          ))}
        </ul>
      )}
      {nextCursor && (
        <Button asChild variant="secondary" className="self-center">
          <Link href={`/worker/bookings?tab=${tab}&cursor=${nextCursor}`}>Show more</Link>
        </Button>
      )}
    </div>
  )
}
