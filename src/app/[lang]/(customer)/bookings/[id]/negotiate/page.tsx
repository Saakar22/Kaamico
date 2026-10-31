import { CalendarClock, MapPin } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AutoRefresh } from '@/components/domain/booking/auto-refresh'
import { QuickMatchPanel } from '@/components/domain/booking/quick-match-panel'
import { statusLabel } from '@/components/domain/negotiation/booking-status'
import { CancelBookingButton } from '@/components/domain/negotiation/cancel-booking-button'
import { NegotiationThread } from '@/components/domain/negotiation/negotiation-thread'
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
import { getCustomerBooking, getQuickMatch } from '@/modules/bookings/views'
import { unitSuffix } from '@/modules/catalog/units'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('negotiate.metaTitle') }
}

const CANCELLABLE = ['REQUESTED', 'NEGOTIATING', 'CONFIRMED', 'EN_ROUTE', 'ARRIVED']

async function load(
  actorId: Parameters<typeof getCustomerBooking>[0],
  id: string,
  locale: Locale,
) {
  try {
    return await getCustomerBooking(actorId, id, new Date(), locale)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

export default async function NegotiatePage({
  params,
}: PageProps<'/[lang]/bookings/[id]/negotiate'>) {
  const actor = await requirePageActor('CUSTOMER')
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const booking = await load(actor, (await params).id, locale)
  const firstName = booking.worker.displayName.split(' ')[0]
  const when =
    booking.timing === 'ON_DEMAND'
      ? t('book.asap')
      : formatIstDateTime(new Date(booking.slot?.start ?? booking.requestedStart), htmlLang[locale])
  const afterSetOff = booking.status === 'EN_ROUTE' || booking.status === 'ARRIVED'
  // Confirmed or later: the booking page tracks it; the thread stays for messages.
  const booked = !['REQUESTED', 'NEGOTIATING', 'CANCELLED', 'EXPIRED'].includes(booking.status)
  // An open quick match has no single professional yet: show everyone it went to.
  const matching =
    booking.mode === 'BROADCAST' && ['REQUESTED', 'NEGOTIATING'].includes(booking.status)
  const candidates = matching ? await getQuickMatch(actor, booking.id) : []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={booking.service.name}
        description={
          matching
            ? t('negotiate.quickMatch', { code: booking.code })
            : `${statusLabel(booking.status, 'customer', firstName, t)} · ${booking.code}`
        }
      />
      <AutoRefresh intervalMs={5_000} enabled={matching} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {matching && (
            <QuickMatchPanel
              bookingId={booking.id}
              version={booking.version}
              candidates={candidates}
            />
          )}
          {!matching && (
            <NegotiationThread
              viewer="customer"
              counterpartName={firstName}
              data={{
                bookingId: booking.id,
                status: booking.status,
                version: booking.version,
                listedPaise: booking.price.listedPaise,
                agreedPaise: booking.price.agreedPaise,
                offers: booking.offers,
                messages: booking.messages,
                negotiation: booking.negotiation,
                startCode: booking.startCode,
              }}
            />
          )}
          {booked && (
            <Button asChild size="lg" className="self-start">
              <Link href={`/bookings/${booking.id}`}>{t('negotiate.track')}</Link>
            </Button>
          )}
          {['CANCELLED', 'EXPIRED'].includes(booking.status) && (
            <Card>
              <CardContent className="flex flex-col items-start gap-3">
                <p>
                  {booking.status === 'CANCELLED' && booking.cancellationReason
                    ? `${booking.cancellationReason}. `
                    : ''}
                  {t('negotiate.askAnother')}
                </p>
                <Button asChild>
                  <Link href={`/search?service=${booking.service.id}`}>
                    {t('negotiate.findAnother')}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-4" aria-label={t('negotiate.summary')}>
          <Card>
            <CardContent className="flex flex-col gap-4">
              {!matching && (
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
              )}
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
                {booking.price.listedPaise !== null && (
                  <div className="flex justify-between gap-2 border-t border-border pt-2">
                    <dt>{t('negotiate.listedPrice')}</dt>
                    <dd>
                      <Money paise={booking.price.listedPaise} />{' '}
                      <span className="text-ink-600">
                        {unitSuffix(booking.service.unit, locale)}
                      </span>
                    </dd>
                  </div>
                )}
                {booking.price.agreedPaise !== null && (
                  <div className="flex justify-between gap-2 font-semibold">
                    <dt>{t('negotiate.agreedPrice')}</dt>
                    <dd>
                      <Money paise={booking.price.agreedPaise} />
                    </dd>
                  </div>
                )}
              </dl>
              {booking.description && (
                <p className="text-sm text-ink-600">“{booking.description}”</p>
              )}
            </CardContent>
          </Card>
          {CANCELLABLE.includes(booking.status) && (
            <CancelBookingButton
              bookingId={booking.id}
              version={booking.version}
              label={
                ['REQUESTED', 'NEGOTIATING'].includes(booking.status)
                  ? t('cancel.cancelRequest')
                  : t('cancel.cancelBooking')
              }
              description={
                afterSetOff ? t('cancel.visitFee', { name: firstName }) : t('cancel.free')
              }
            />
          )}
        </aside>
      </div>
    </div>
  )
}
