import { CalendarClock, Inbox, MapPin, Zap } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { LinkTabs } from '@/components/patterns/link-tabs'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { htmlLang } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import { formatIstDateTime, formatIstTime } from '@/lib/time'
import { listWorkerRequests, type RequestState } from '@/modules/bookings/views'
import { requireWorkerPage } from '@/modules/workers/page-guard'
import { getStatus } from '@/modules/workers/status'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('wreq.metaTitle') }
}

const TABS: { key: RequestState; label: MessageKey }[] = [
  { key: 'new', label: 'wreq.tabNew' },
  { key: 'negotiating', label: 'wreq.tabNegotiating' },
  { key: 'missed', label: 'wreq.tabMissed' },
]

const EMPTY: Record<RequestState, MessageKey> = {
  new: 'wreq.emptyNew',
  negotiating: 'wreq.emptyNegotiating',
  missed: 'wreq.emptyMissed',
}

export default async function WorkerRequestsPage({
  searchParams,
}: PageProps<'/[lang]/worker/requests'>) {
  const actor = await requireWorkerPage()
  const { state: raw } = await searchParams
  const state = TABS.find((t) => t.key === raw)?.key ?? 'new'
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const lang = htmlLang[locale]
  const [requests, status] = await Promise.all([
    listWorkerRequests(actor, state, new Date(), locale),
    getStatus(actor.workerId),
  ])

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('wreq.title')} description={t('wreq.description')} />
      {status.pausedUntil && (
        <p className="rounded-md bg-warning-700/10 px-3 py-2" role="status">
          {t('wreq.paused')}
        </p>
      )}
      <LinkTabs
        label={t('wreq.tabs')}
        current={state}
        tabs={TABS.map((tab) => ({
          key: tab.key,
          label: t(tab.label),
          href: `/worker/requests?state=${tab.key}`,
        }))}
      />
      {requests.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title={t('wreq.nothing')} description={t(EMPTY[state])} />
        </Card>
      ) : (
        <ul
          className="flex flex-col gap-3"
          aria-label={t('wreq.listLabel', {
            tab: t(TABS.find((tab) => tab.key === state)!.label),
          })}
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
                      {t('wreq.forCustomer', { service: r.serviceName, name: r.customerFirstName })}
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
                            <Zap aria-hidden="true" className="size-4" /> {t('book.asap')}
                          </>
                        ) : (
                          <>
                            <CalendarClock aria-hidden="true" className="size-4" />{' '}
                            {formatIstDateTime(new Date(r.requestedStart), lang)}
                          </>
                        )}
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    {r.latestOffer && (
                      <span>
                        {r.latestOffer.by === 'CUSTOMER' ? t('wreq.offers') : t('wreq.youAsked')}{' '}
                        <Money paise={r.latestOffer.amountPaise} className="font-semibold" />
                      </span>
                    )}
                    {theirTurn && state !== 'missed' && (
                      <Badge tone="warning">
                        {t('wreq.replyBy', {
                          time: formatIstTime(new Date(r.latestOffer!.expiresAt), lang),
                        })}
                      </Badge>
                    )}
                    {state === 'missed' && (
                      <Badge>
                        {r.status === 'CANCELLED' ? t('wreq.closed') : t('wreq.expired')}
                      </Badge>
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
