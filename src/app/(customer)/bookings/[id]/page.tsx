import { CalendarClock, KeyRound, Lock, MapPin, MessagesSquare } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AutoRefresh } from '@/components/domain/booking/auto-refresh'
import { BookingTimeline } from '@/components/domain/booking/booking-timeline'
import { ChargeApprovalDialog } from '@/components/domain/booking/charge-approval-dialog'
import { PriceBreakdown } from '@/components/domain/booking/price-breakdown'
import { statusLabel } from '@/components/domain/negotiation/booking-status'
import { CancelBookingButton } from '@/components/domain/negotiation/cancel-booking-button'
import { VerificationBadge } from '@/components/domain/trust-badges'
import { PageHeader } from '@/components/patterns/page-header'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { AppError } from '@/lib/errors'
import { formatIstDateTime } from '@/lib/time'
import { requirePageActor } from '@/modules/auth/page-guards'
import type { Actor } from '@/modules/auth/types'
import { OPEN_REQUEST, TERMINAL } from '@/modules/bookings/state-machine'
import { getCustomerBooking } from '@/modules/bookings/views'

export const instant = false

export const metadata: Metadata = { title: 'Your booking' }

const POLL_MS = 10_000
const CANCELLABLE = ['CONFIRMED', 'EN_ROUTE', 'ARRIVED']

async function load(actor: Actor, id: string) {
  try {
    return await getCustomerBooking(actor, id)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

/** Confirmation, tracking, extra charges and cancellation for one booking (§5). */
export default async function BookingPage({ params, searchParams }: PageProps<'/bookings/[id]'>) {
  const actor = await requirePageActor('CUSTOMER')
  const [{ id }, query] = await Promise.all([params, searchParams])
  const booking = await load(actor, id)
  // Still agreeing a price: the thread is the page for that.
  if (OPEN_REQUEST.includes(booking.status)) redirect(`/bookings/${booking.id}/negotiate`)

  const firstName = booking.worker.displayName.split(' ')[0]
  const when =
    booking.timing === 'ON_DEMAND' && !booking.slot
      ? 'As soon as possible'
      : formatIstDateTime(new Date(booking.slot?.start ?? booking.requestedStart))
  const proposed = booking.charges.find((c) => c.status === 'PROPOSED')
  const live = !TERMINAL.includes(booking.status)
  const justConfirmed = query.confirmed === '1' && booking.status === 'CONFIRMED'

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh intervalMs={POLL_MS} enabled={live} />
      <PageHeader
        title={booking.service.name}
        description={`${statusLabel(booking.status, 'customer', firstName)} · ${booking.code}`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {justConfirmed && booking.price.agreedPaise !== null && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg border border-success-700/30 bg-success-700/10 p-4 text-lg font-semibold"
            >
              <Lock aria-hidden="true" className="size-5 shrink-0 text-success-800" />
              <span>
                Confirmed · Price locked at <Money paise={booking.price.agreedPaise} />
              </span>
            </div>
          )}

          {booking.startCode && (
            <Card>
              <CardContent className="flex flex-col gap-2">
                <h2 className="flex items-center gap-2 font-semibold">
                  <KeyRound aria-hidden="true" className="size-5 text-brand-700" />
                  Your start code
                </h2>
                <span
                  className="font-mono text-4xl font-bold tracking-[0.4em]"
                  aria-label={`Start code ${booking.startCode.split('').join(' ')}`}
                >
                  {booking.startCode}
                </span>
                <p className="text-sm text-ink-600">
                  Tell {firstName} this code when they arrive. The job only starts with it, so
                  don&apos;t share it before then.
                </p>
              </CardContent>
            </Card>
          )}

          {proposed && booking.price.totalPaise !== null && (
            <ChargeApprovalDialog
              key={proposed.id}
              charge={proposed}
              currentTotalPaise={booking.price.totalPaise}
              workerName={firstName}
            />
          )}

          <Card>
            <CardContent>
              <BookingTimeline
                history={booking.history}
                status={booking.status}
                viewer="customer"
                counterpartName={firstName}
              />
            </CardContent>
          </Card>

          {['CANCELLED', 'EXPIRED'].includes(booking.status) && (
            <Card>
              <CardContent className="flex flex-col items-start gap-3">
                <p>
                  {booking.cancellationReason ? `${booking.cancellationReason}. ` : ''}You can book
                  another professional nearby.
                </p>
                <Button asChild>
                  <Link href={`/search?service=${booking.service.id}`}>
                    Find another professional
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
          {booking.status === 'COMPLETED' && (
            <Card>
              <CardContent className="flex flex-col items-start gap-3">
                <p>Need {booking.service.name.toLowerCase()} again?</p>
                <Button asChild variant="secondary">
                  <Link href={`/book/${booking.service.id}?worker=${booking.worker.id}`}>
                    Book {firstName} again
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-4" aria-label="Booking summary">
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
                  <dt className="sr-only">When</dt>
                  <CalendarClock
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-ink-600"
                  />
                  <dd>{when}</dd>
                </div>
                <div className="flex items-start gap-2">
                  <dt className="sr-only">Where</dt>
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
                Offers and messages
              </Link>
            </CardContent>
          </Card>
          {CANCELLABLE.includes(booking.status) && (
            <CancelBookingButton
              bookingId={booking.id}
              version={booking.version}
              label="Cancel booking"
              description={
                booking.status === 'CONFIRMED'
                  ? 'Cancelling now is free.'
                  : `${firstName} has already set off, so a visit fee of up to ₹99 applies.`
              }
            />
          )}
        </aside>
      </div>
    </div>
  )
}
