import {
  CalendarClock,
  ChevronLeft,
  ExternalLink,
  LifeBuoy,
  MapPin,
  MessagesSquare,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AutoRefresh } from '@/components/domain/booking/auto-refresh'
import { BookingTimeline } from '@/components/domain/booking/booking-timeline'
import { ChargeProposalForm } from '@/components/domain/booking/charge-proposal-form'
import { PriceBreakdown } from '@/components/domain/booking/price-breakdown'
import { DisputePanel } from '@/components/domain/disputes/dispute-panel'
import { ReportProblemDialog } from '@/components/domain/disputes/report-problem-dialog'
import { StatusActionBar } from '@/components/domain/booking/status-action-bar'
import { WorkerPaymentPanel } from '@/components/domain/payments/worker-payment-panel'
import { CustomerRatingForm } from '@/components/domain/reviews/customer-rating-form'
import { statusLabel } from '@/components/domain/negotiation/booking-status'
import { CancelBookingButton } from '@/components/domain/negotiation/cancel-booking-button'
import { PageHeader } from '@/components/patterns/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { htmlLang, type Locale } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import { AppError } from '@/lib/errors'
import { formatIstDateTime } from '@/lib/time'
import type { Actor } from '@/modules/auth/types'
import { TERMINAL } from '@/modules/bookings/state-machine'
import { getWorkerBooking } from '@/modules/bookings/views'
import { bookingDispute, canReport } from '@/modules/disputes/disputes'
import { commissionOf } from '@/modules/ledger/postings'
import { bookingPayment, owesVisitFee } from '@/modules/payments/payments'
import {
  CUSTOMER_TAG_LABELS,
  CUSTOMER_TAGS,
  customerRatingState,
} from '@/modules/reviews/customer-ratings'
import { negotiationConfig } from '@/modules/negotiation/config'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('wjobs.jobTitle') }
}

const POLL_MS = 10_000

async function load(actor: Actor, id: string, locale: Locale) {
  try {
    return await getWorkerBooking(actor, id, new Date(), locale)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

/** Job execution for the assigned professional: address, next step, extra charges (§5). */
export default async function WorkerJobPage({ params }: PageProps<'/[lang]/worker/bookings/[id]'>) {
  const actor = await requireWorkerPage()
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const job = await load(actor, (await params).id, locale)
  const visitFee = owesVisitFee(job) ? job.visitFeePaise : null
  const payment = job.status === 'COMPLETED' || visitFee ? await bookingPayment(job.id) : null
  const payable = visitFee ?? job.price.totalPaise
  const customerRating =
    job.status === 'COMPLETED' ? await customerRatingState(actor, job.id) : null
  // Only the assigned professional reaches this page, so the booking is theirs.
  const dispute = await bookingDispute(actor, {
    id: job.id,
    customerId: '',
    workerId: actor.workerId,
  })
  const disputeOpen = dispute?.status === 'OPEN' || dispute?.status === 'UNDER_REVIEW'
  const report = canReport(job)
  const name = job.customerFirstName
  const when =
    job.timing === 'ON_DEMAND' && !job.slot
      ? t('book.asap')
      : formatIstDateTime(new Date(job.slot?.start ?? job.requestedStart), htmlLang[locale])
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
        {t('wjobs.all')}
      </Link>
      <PageHeader
        title={t('wreq.forCustomer', { service: job.service.name, name })}
        description={`${statusLabel(job.status, 'worker', name, t)} · ${job.code}`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {dispute && <DisputePanel dispute={dispute} viewer="WORKER" />}
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
                    {t('wjobs.directions')}
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          {payment && payable !== null && (
            <WorkerPaymentPanel
              bookingId={job.id}
              customerName={name}
              totalPaise={payable}
              feePaise={commissionOf(payable, job.commissionBps)}
              state={payment}
              visitFee={visitFee !== null}
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
          {customerRating?.canRate && (
            <CustomerRatingForm
              bookingId={job.id}
              customerName={name}
              tags={CUSTOMER_TAGS.map((id) => ({ id, label: CUSTOMER_TAG_LABELS[id][locale] }))}
            />
          )}
          {customerRating?.rating && (
            <p className="text-sm text-ink-600" role="status">
              {t('rateCustomer.done', { name, rating: customerRating.rating })}
            </p>
          )}

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

        <aside className="flex flex-col gap-4" aria-label={t('wjobs.details')}>
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
                {t('wjobs.messages', { name })}
              </Link>
            </CardContent>
          </Card>
          {report.allowed && !disputeOpen && (
            <ReportProblemDialog bookingId={job.id} safetyOnly={report.safetyOnly} />
          )}
          <Link
            href={`/worker/support?booking=${job.id}`}
            className="inline-flex h-11 items-center gap-2 text-sm font-medium text-brand-700 hover:underline"
          >
            <LifeBuoy aria-hidden="true" className="size-4" />
            {t('wjobs.help')}
          </Link>
          {job.status === 'CONFIRMED' && (
            <CancelBookingButton
              bookingId={job.id}
              version={job.version}
              label={t('wjobs.cancelJob')}
              reasonRequired
              description={t('wjobs.cancelJobHint', { name })}
            />
          )}
          {job.status === 'ARRIVED' && (
            <CancelBookingButton
              bookingId={job.id}
              version={job.version}
              label={t('wjobs.noShow')}
              reasonRequired
              description={t('wjobs.noShowHint', {
                minutes: negotiationConfig.noShowMinutes,
                name,
              })}
            />
          )}
        </aside>
      </div>
    </div>
  )
}
