import { CalendarClock, ChevronLeft, MapPin } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { statusLabel } from '@/components/domain/negotiation/booking-status'
import { DeclineRequestButton } from '@/components/domain/negotiation/decline-request-button'
import { NegotiationThread } from '@/components/domain/negotiation/negotiation-thread'
import { PageHeader } from '@/components/patterns/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { AppError } from '@/lib/errors'
import { formatIstDateTime } from '@/lib/time'
import { getWorkerRequest } from '@/modules/bookings/views'
import { unitSuffix } from '@/modules/catalog/units'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export const metadata: Metadata = { title: 'Request' }

export default async function WorkerRequestPage({ params }: PageProps<'/worker/requests/[id]'>) {
  const actor = await requireWorkerPage()
  let request
  try {
    request = await getWorkerRequest(actor, (await params).id)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
  const open = ['REQUESTED', 'NEGOTIATING'].includes(request.status)
  const when =
    request.timing === 'ON_DEMAND'
      ? 'As soon as possible'
      : formatIstDateTime(new Date(request.slot?.start ?? request.requestedStart))

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/worker/requests"
        className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        All requests
      </Link>
      <PageHeader
        title={`${request.service.name} for ${request.customerFirstName}`}
        description={`${statusLabel(request.status, 'worker', request.customerFirstName)} · ${request.code}`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
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
        <aside className="flex flex-col gap-4" aria-label="Request details">
          <Card>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p className="flex items-start gap-2">
                <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-600" />
                {when}
              </p>
              <p className="flex items-start gap-2">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-600" />
                {request.localityLabel} · about {request.distanceKm} km away
              </p>
              {request.price.listedPaise !== null && (
                <p>
                  Your listed price: <Money paise={request.price.listedPaise} />{' '}
                  {unitSuffix(request.service.unit)}
                </p>
              )}
              {request.description && <p className="text-ink-900">“{request.description}”</p>}
              {!request.address && (
                <p className="text-ink-600">
                  The full address appears once the booking is confirmed.
                </p>
              )}
            </CardContent>
          </Card>
          {open && <DeclineRequestButton invitationId={request.invitationId} />}
        </aside>
      </div>
    </div>
  )
}
