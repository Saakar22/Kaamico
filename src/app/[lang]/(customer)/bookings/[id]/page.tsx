import { CalendarClock, KeyRound, LifeBuoy, Lock, MapPin, MessagesSquare } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AutoRefresh } from '@/components/domain/booking/auto-refresh'
import { BookingTimeline } from '@/components/domain/booking/booking-timeline'
import { ChargeApprovalDialog } from '@/components/domain/booking/charge-approval-dialog'
import { DisputePanel } from '@/components/domain/disputes/dispute-panel'
import { ReportProblemDialog } from '@/components/domain/disputes/report-problem-dialog'
import { PriceBreakdown } from '@/components/domain/booking/price-breakdown'
import { PaymentPanel } from '@/components/domain/payments/payment-panel'
import { RatingStars } from '@/components/domain/professionals/rating'
import { statusLabel } from '@/components/domain/negotiation/booking-status'
import { CancelBookingButton } from '@/components/domain/negotiation/cancel-booking-button'
import { VerificationBadge } from '@/components/domain/trust-badges'
import { PageHeader } from '@/components/patterns/page-header'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { htmlLang, type Locale } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import { AppError } from '@/lib/errors'
import { formatIstDateTime } from '@/lib/time'
import { requirePageActor } from '@/modules/auth/page-guards'
import type { Actor } from '@/modules/auth/types'
import { OPEN_REQUEST, TERMINAL } from '@/modules/bookings/state-machine'
import { getCustomerBooking } from '@/modules/bookings/views'
import { bookingDispute, canReport } from '@/modules/disputes/disputes'
import { bookingPayment, onlineMethod, owesVisitFee } from '@/modules/payments/payments'
import { reviewState } from '@/modules/reviews/reviews'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('bookingPage.metaTitle') }
}

const POLL_MS = 10_000
const CANCELLABLE = ['CONFIRMED', 'EN_ROUTE', 'ARRIVED']

async function load(actor: Actor, id: string, locale: Locale) {
  try {
    return await getCustomerBooking(actor, id, new Date(), locale)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

/** Confirmation, tracking, extra charges and cancellation for one booking (§5). */
export default async function BookingPage({
  params,
  searchParams,
}: PageProps<'/[lang]/bookings/[id]'>) {
  const actor = await requirePageActor('CUSTOMER')
  const [{ id }, query] = await Promise.all([params, searchParams])
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const booking = await load(actor, id, locale)
  // Still agreeing a price: the thread is the page for that.
  if (OPEN_REQUEST.includes(booking.status)) redirect(`/bookings/${booking.id}/negotiate`)
  const completed = booking.status === 'COMPLETED'
  const visitFee = owesVisitFee(booking) ? booking.visitFeePaise : null
  const [payment, review] = completed
    ? await Promise.all([bookingPayment(booking.id), reviewState(actor, booking.id)])
    : [visitFee ? await bookingPayment(booking.id) : null, null]
  const dispute = await bookingDispute(actor, {
    id: booking.id,
    customerId: actor.userId,
    workerId: null,
  })
  const disputeOpen = dispute?.status === 'OPEN' || dispute?.status === 'UNDER_REVIEW'
  const report = canReport(booking)

  const firstName = booking.worker.displayName.split(' ')[0]
  const when =
    booking.timing === 'ON_DEMAND' && !booking.slot
      ? t('book.asap')
      : formatIstDateTime(new Date(booking.slot?.start ?? booking.requestedStart), htmlLang[locale])
  const proposed = booking.charges.find((c) => c.status === 'PROPOSED')
  // Keep refreshing a completed job (or visit fee) until it is paid: the professional confirms cash.
  const live = !TERMINAL.includes(booking.status) || payment?.state === 'AWAITING_CASH'
  const justConfirmed = query.confirmed === '1' && booking.status === 'CONFIRMED'

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh intervalMs={POLL_MS} enabled={live} />
      <PageHeader
        title={booking.service.name}
        description={`${statusLabel(booking.status, 'customer', firstName, t)} · ${booking.code}`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {dispute && <DisputePanel dispute={dispute} viewer="CUSTOMER" />}
          {payment && (visitFee ?? booking.price.totalPaise) !== null && (
            <PaymentPanel
              bookingId={booking.id}
              totalPaise={(visitFee ?? booking.price.totalPaise)!}
              workerName={firstName}
              state={payment}
              online={onlineMethod()}
              visitFee={visitFee !== null}
            />
          )}

          {review?.review && (
            <Card>
              <CardContent className="flex flex-col gap-1">
                <h2 className="font-semibold">{t('bookingPage.yourReview')}</h2>
                <RatingStars rating={review.review.rating} />
                {review.review.comment && <p className="text-ink-600">“{review.review.comment}”</p>}
              </CardContent>
            </Card>
          )}
          {review?.canReview && (
            <Card>
              <CardContent className="flex flex-col items-start gap-3">
                <p>{t('bookingPage.howDid', { name: firstName })}</p>
                <Button asChild>
                  <Link href={`/bookings/${booking.id}/review`}>
                    {t('bookingPage.rate', { name: firstName })}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {justConfirmed && booking.price.agreedPaise !== null && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-md border border-success-700/30 bg-success-700/10 p-4 text-lg font-semibold"
            >
              <Lock aria-hidden="true" className="size-5 shrink-0 text-success-800" />
              <span>
                {t('thread.priceLocked')} <Money paise={booking.price.agreedPaise} />
              </span>
            </div>
          )}

          {booking.startCode && (
            // A ticket stub: the one thing the customer must have ready when the pro arrives.
            <section
              aria-labelledby="start-code-title"
              className="flex flex-col gap-3 rounded-md border-2 border-dashed border-brand-600/50 bg-brand-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
            >
              <div className="flex flex-col gap-1">
                <h2
                  id="start-code-title"
                  className="flex items-center gap-2 font-display text-xl font-semibold"
                >
                  <KeyRound aria-hidden="true" className="size-5 text-brand-700" />
                  {t('bookingPage.startCode')}
                </h2>
                <p className="max-w-sm text-sm text-ink-600">
                  {t('bookingPage.startCodeHelp', { name: firstName })}
                </p>
              </div>
              <span
                role="img"
                className="flex gap-2"
                aria-label={t('thread.startCodeLabel', {
                  digits: booking.startCode.split('').join(' '),
                })}
              >
                {booking.startCode.split('').map((digit, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className="flex h-14 w-11 items-center justify-center rounded-sm border border-border bg-surface font-display text-4xl font-semibold tabular-nums"
                  >
                    {digit}
                  </span>
                ))}
              </span>
            </section>
          )}

          {proposed && booking.price.totalPaise !== null && (
            <ChargeApprovalDialog
              key={proposed.id}
              charge={proposed}
              currentTotalPaise={booking.price.totalPaise}
              workerName={firstName}
            />
          )}

          <div className="border-t border-border pt-5">
            <BookingTimeline
              history={booking.history}
              status={booking.status}
              viewer="customer"
              counterpartName={firstName}
            />
          </div>

          {['CANCELLED', 'EXPIRED'].includes(booking.status) && (
            <Card>
              <CardContent className="flex flex-col items-start gap-3">
                <p>
                  {booking.cancellationReason ? `${booking.cancellationReason}. ` : ''}
                  {t('bookingPage.bookAnother')}
                </p>
                <Button asChild>
                  <Link href={`/search?service=${booking.service.id}`}>
                    {t('negotiate.findAnother')}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
          {booking.status === 'COMPLETED' && (
            <Card>
              <CardContent className="flex flex-col items-start gap-3">
                <p>{t('bookingPage.needAgain', { service: booking.service.name.toLowerCase() })}</p>
                <Button asChild variant="secondary">
                  <Link href={`/book/${booking.service.id}?worker=${booking.worker.id}`}>
                    {t('bookingPage.bookAgain', { name: firstName })}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-4" aria-label={t('negotiate.summary')}>
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Avatar name={booking.worker.displayName} src={booking.worker.photoUrl} />
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/professionals/${booking.worker.id}`}
                    className="font-semibold hover:underline"
                  >
                    {booking.worker.displayName}
                  </Link>
                  <VerificationBadge status="VERIFIED" />
                </div>
              </div>
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex items-start gap-2">
                  <dt className="sr-only">{t('negotiate.when')}</dt>
                  <CalendarClock
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-ink-600"
                  />
                  <dd>{when}</dd>
                </div>
                <div className="flex items-start gap-2">
                  <dt className="sr-only">{t('negotiate.where')}</dt>
                  <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-600" />
                  <dd>
                    {booking.address.line1}, {booking.localityLabel}
                  </dd>
                </div>
              </dl>
              <div className="border-t border-border pt-3">
                <PriceBreakdown price={booking.price} charges={booking.charges} />
              </div>
              <Link
                href={`/bookings/${booking.id}/negotiate`}
                className="inline-flex h-11 items-center gap-2 text-sm font-medium text-brand-700 hover:underline"
              >
                <MessagesSquare aria-hidden="true" className="size-4" />
                {t('bookingPage.offersAndMessages')}
              </Link>
            </CardContent>
          </Card>
          {report.allowed && !disputeOpen && (
            <ReportProblemDialog bookingId={booking.id} safetyOnly={report.safetyOnly} />
          )}
          <Link
            href={`/support?booking=${booking.id}`}
            className="inline-flex h-11 items-center gap-2 text-sm font-medium text-brand-700 hover:underline"
          >
            <LifeBuoy aria-hidden="true" className="size-4" />
            {t('bookingPage.help')}
          </Link>
          {CANCELLABLE.includes(booking.status) && (
            <CancelBookingButton
              bookingId={booking.id}
              version={booking.version}
              label={t('cancel.cancelBooking')}
              description={
                booking.status === 'CONFIRMED'
                  ? t('cancel.free')
                  : t('cancel.visitFee', { name: firstName })
              }
            />
          )}
        </aside>
      </div>
    </div>
  )
}
