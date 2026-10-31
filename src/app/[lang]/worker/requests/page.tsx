import { CalendarClock, Inbox, MapPin, Zap } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { LinkTabs } from '@/components/patterns/link-tabs'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { formatIstDateTime, formatIstTime } from '@/lib/time'
import { listWorkerRequests, type RequestState } from '@/modules/bookings/views'
import { requireWorkerPage } from '@/modules/workers/page-guard'
import { getStatus } from '@/modules/workers/status'

export const instant = false

export const metadata: Metadata = { title: 'Requests' }

const TABS: { key: RequestState; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'negotiating', label: 'Negotiating' },
  { key: 'missed', label: 'Missed' },
]

const EMPTY: Record<RequestState, string> = {
  new: 'New requests from customers near you appear here.',
  negotiating: 'Requests where you are agreeing a price appear here.',
  missed: 'Requests that expired or were closed appear here.',
}

export default async function WorkerRequestsPage({
  searchParams,
}: PageProps<'/[lang]/worker/requests'>) {
  const actor = await requireWorkerPage()
  const { state: raw } = await searchParams
  const state = TABS.find((t) => t.key === raw)?.key ?? 'new'
  const [requests, status] = await Promise.all([
    listWorkerRequests(actor, state),
    getStatus(actor.workerId),
  ])

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Requests"
        description="Reply quickly: requests expire if nobody agrees a price in time."
      />
      {status.pausedUntil && (
        <p className="rounded-md bg-warning-700/10 px-3 py-2" role="status">
          You&apos;re paused, so you won&apos;t get new requests.
        </p>
      )}
      <LinkTabs
        label="Request types"
        current={state}
        tabs={TABS.map((t) => ({ ...t, href: `/worker/requests?state=${t.key}` }))}
      />
      {requests.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title="Nothing here yet" description={EMPTY[state]} />
        </Card>
      ) : (
        <ul
          className="flex flex-col gap-3"
          aria-label={`${TABS.find((t) => t.key === state)!.label} requests`}
        >
          {requests.map((r) => {
            const theirTurn = r.latestOffer?.by === 'CUSTOMER' && r.latestOffer.status === 'PENDING'
            return (
              <li key={r.invitationId}>
                <Link
                  href={`/worker/requests/${r.invitationId}`}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 hover:border-brand-600 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold">
                      {r.serviceName} for {r.customerFirstName}
                    </span>
                    <span className="text-xs text-ink-600">{r.code}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-600">
                      <span className="flex items-center gap-1">
                        <MapPin aria-hidden="true" className="size-4" />
                        {r.localityLabel} · {r.distanceKm} km
                      </span>
                      <span className="flex items-center gap-1">
                        {r.timing === 'ON_DEMAND' ? (
                          <>
                            <Zap aria-hidden="true" className="size-4" /> As soon as possible
                          </>
                        ) : (
                          <>
                            <CalendarClock aria-hidden="true" className="size-4" />{' '}
                            {formatIstDateTime(new Date(r.requestedStart))}
                          </>
                        )}
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    {r.latestOffer && (
                      <span>
                        {r.latestOffer.by === 'CUSTOMER' ? 'Offers ' : 'You asked '}
                        <Money paise={r.latestOffer.amountPaise} className="font-semibold" />
                      </span>
                    )}
                    {theirTurn && state !== 'missed' && (
                      <Badge tone="warning">
                        Reply by {formatIstTime(new Date(r.latestOffer!.expiresAt))}
                      </Badge>
                    )}
                    {state === 'missed' && (
                      <Badge>{r.status === 'CANCELLED' ? 'Closed' : 'Expired'}</Badge>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
