import { CalendarClock, ChevronLeft, ExternalLink, MapPin, MessagesSquare } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AutoRefresh } from '@/components/domain/booking/auto-refresh'
import { BookingTimeline } from '@/components/domain/booking/booking-timeline'
import { ChargeProposalForm } from '@/components/domain/booking/charge-proposal-form'
import { PriceBreakdown } from '@/components/domain/booking/price-breakdown'
import { StatusActionBar } from '@/components/domain/booking/status-action-bar'
import { WorkerPaymentPanel } from '@/components/domain/payments/worker-payment-panel'
import { statusLabel } from '@/components/domain/negotiation/booking-status'
import { CancelBookingButton } from '@/components/domain/negotiation/cancel-booking-button'
import { PageHeader } from '@/components/patterns/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { AppError } from '@/lib/errors'
import { formatIstDateTime } from '@/lib/time'
import type { Actor } from '@/modules/auth/types'
import { TERMINAL } from '@/modules/bookings/state-machine'
import { getWorkerBooking } from '@/modules/bookings/views'
import { commissionOf } from '@/modules/ledger/postings'
import { bookingPayment } from '@/modules/payments/payments'
import { negotiationConfig } from '@/modules/negotiation/config'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export const metadata: Metadata = { title: 'Job' }

const POLL_MS = 10_000

async function load(actor: Actor, id: string) {
  try {
    return await getWorkerBooking(actor, id)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

/** Job execution for the assigned professional: address, next step, extra charges (§5). */
export default async function WorkerJobPage({ params }: PageProps<'/worker/bookings/[id]'>) {
  const actor = await requireWorkerPage()
  const job = await load(actor, (await params).id)
  const payment = job.status === 'COMPLETED' ? await bookingPayment(job.id) : null
  const name = job.customerFirstName
  const when =
    job.timing === 'ON_DEMAND' && !job.slot
      ? 'As soon as possible'
      : formatIstDateTime(new Date(job.slot?.start ?? job.requestedStart))
  const chargePending = job.charges.some((c) => c.status === 'PROPOSED')
  const onSite = job.status === 'ARRIVED' || job.status === 'IN_PROGRESS'
  const address = job.address
    ? [
        job.address.line1,
        job.address.line2,
        job.address.landmark,
        job.address.locality,
        job.address.city,
        job.address.pincode,
      ]
        .filter(Boolean)
        .join(', ')
    : null

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh
        intervalMs={POLL_MS}
        enabled={!TERMINAL.includes(job.status) || (payment !== null && payment.state !== 'PAID')}
      />
      <Link
        href="/worker/bookings"
        className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        All jobs
      </Link>
      <PageHeader
        title={`${job.service.name} for ${name}`}
        description={`${statusLabel(job.status, 'worker', name)} · ${job.code}`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {address && (
            <Card>
              <CardContent className="flex flex-col gap-3">
                <p className="flex items-start gap-2">
                  <MapPin aria-hidden="true" className="mt-1 size-4 shrink-0 text-brand-700" />
                  <span>{address}</span>
                </p>
                {job.location && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${job.location.lat},${job.location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 w-fit items-center gap-2 text-sm font-medium text-brand-700 hover:underline"
                  >
                    <ExternalLink aria-hidden="true" className="size-4" />
                    Directions in Google Maps
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          {payment && job.price.totalPaise !== null && (
            <WorkerPaymentPanel
              bookingId={job.id}
              customerName={name}
              totalPaise={job.price.totalPaise}
              feePaise={commissionOf(job.price.totalPaise, job.commissionBps)}
              state={payment}
            />
          )}
          <StatusActionBar
            bookingId={job.id}
            status={job.status}
            version={job.version}
            customerFirstName={name}
            startCodeAttemptsLeft={job.startCodeAttemptsLeft}
            chargePending={chargePending}
          />
          {onSite && <ChargeProposalForm bookingId={job.id} customerFirstName={name} />}

          <Card>
            <CardContent>
              <BookingTimeline
                history={job.history}
                status={job.status}
                viewer="worker"
                counterpartName={name}
              />
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-4" aria-label="Job details">
          <Card>
            <CardContent className="flex flex-col gap-4 text-sm">
              <p className="flex items-start gap-2">
                <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-600" />
                {when}
              </p>
              {job.description && <p className="text-ink-900">“{job.description}”</p>}
              <div className="border-t border-border pt-3">
                <PriceBreakdown price={job.price} charges={job.charges} />
              </div>
              <Link
                href={`/worker/requests/${job.invitationId}`}
                className="inline-flex h-11 items-center gap-2 font-medium text-brand-700 hover:underline"
              >
                <MessagesSquare aria-hidden="true" className="size-4" />
                Messages with {name}
              </Link>
            </CardContent>
          </Card>
          {job.status === 'CONFIRMED' && (
            <CancelBookingButton
              bookingId={job.id}
              version={job.version}
              label="Cancel job"
              reasonRequired
              description={`${name} will be told straight away. Cancelling confirmed jobs lowers your reliability score.`}
            />
          )}
          {job.status === 'ARRIVED' && (
            <CancelBookingButton
              bookingId={job.id}
              version={job.version}
              label="Customer didn't show up"
              reasonRequired
              description={`You can cancel for a no-show ${negotiationConfig.noShowMinutes} minutes after arriving. Send ${name} a message first.`}
            />
          )}
        </aside>
      </div>
    </div>
  )
}
