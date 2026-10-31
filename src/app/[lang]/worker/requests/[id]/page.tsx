import { CalendarClock, ChevronLeft, MapPin, Star } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { statusLabel } from '@/components/domain/negotiation/booking-status'
import { DeclineRequestButton } from '@/components/domain/negotiation/decline-request-button'
import { NegotiationThread } from '@/components/domain/negotiation/negotiation-thread'
import { PageHeader } from '@/components/patterns/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { htmlLang } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import { AppError } from '@/lib/errors'
import { formatIstDateTime } from '@/lib/time'
import { getWorkerRequest } from '@/modules/bookings/views'
import { unitSuffix } from '@/modules/catalog/units'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('wreq.requestTitle') }
}

export default async function WorkerRequestPage({
  params,
}: PageProps<'/[lang]/worker/requests/[id]'>) {
  const actor = await requireWorkerPage()
  const [t, locale] = await Promise.all([getT(), getLocale()])
  let request
  try {
    request = await getWorkerRequest(actor, (await params).id, new Date(), locale)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
  const open = ['REQUESTED', 'NEGOTIATING'].includes(request.status)
  // A quick match someone else accepted: say so rather than the booking's own status.
  const lost = request.invitationStatus === 'LOST' && !request.assigned
  const when =
    request.timing === 'ON_DEMAND'
      ? t('book.asap')
      : formatIstDateTime(new Date(request.slot?.start ?? request.requestedStart), htmlLang[locale])

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/worker/requests"
        className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {t('wreq.all')}
      </Link>
      <PageHeader
        title={t('wreq.forCustomer', {
          service: request.service.name,
          name: request.customerFirstName,
        })}
        description={`${lost ? t('wreq.lost') : statusLabel(request.status, 'worker', request.customerFirstName, t)} · ${request.code}`}
      />
      {request.mode === 'BROADCAST' && open && (
        <p className="rounded-lg border border-accent-500 bg-surface p-3 text-sm" role="note">
          <span className="font-semibold">{t('wreq.quickMatch')}</span>{' '}
          {t('wreq.quickMatchBody', { name: request.customerFirstName })}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {request.assigned && (
            <Button asChild size="lg" className="self-start">
              <Link href={`/worker/bookings/${request.id}`}>{t('wreq.openJob')}</Link>
            </Button>
          )}
          <NegotiationThread
            viewer="worker"
            counterpartName={request.customerFirstName}
            data={{
              bookingId: request.id,
              status: request.status,
              version: request.version,
              listedPaise: request.price.listedPaise,
              agreedPaise: request.price.agreedPaise,
              offers: request.offers,
              messages: request.messages,
              negotiation: request.negotiation,
              address: request.address,
            }}
          />
        </div>
        <aside className="flex flex-col gap-4" aria-label={t('wreq.details')}>
          <Card>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p className="flex items-start gap-2">
                <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-600" />
                {when}
              </p>
              <p className="flex items-start gap-2">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-600" />
                {t('wreq.away', { place: request.localityLabel, km: request.distanceKm })}
              </p>
              <p className="flex items-start gap-2">
                <Star aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-600" />
                {request.customerRating
                  ? t('rateCustomer.customerRating', {
                      avg: request.customerRating.avg.toFixed(1),
                      count: request.customerRating.count,
                    })
                  : t('rateCustomer.newCustomer')}
              </p>
              {request.price.listedPaise !== null && (
                <p>
                  {t('wreq.yourListed')} <Money paise={request.price.listedPaise} />{' '}
                  {unitSuffix(request.service.unit, locale)}
                </p>
              )}
              {request.description && <p className="text-ink-900">“{request.description}”</p>}
              {!request.address && <p className="text-ink-600">{t('wreq.addressLater')}</p>}
            </CardContent>
          </Card>
          {open && <DeclineRequestButton invitationId={request.invitationId} />}
        </aside>
      </div>
    </div>
  )
}
