import { ChevronRight, MapPin, Zap } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { statusBadgeLabel, statusTone } from '@/components/domain/negotiation/booking-status'
import { Badge } from '@/components/ui/badge'
import { Money } from '@/components/ui/money'
import { htmlLang } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import { istDateStub } from '@/lib/time'
import type { CustomerBookingItem, WorkerJobItem } from '@/modules/bookings/lists'

/**
 * The date as a diary stub: weekday, a large day number, month and time. Bookings are
 * about when, so the date leads each row. On-demand jobs carry a bolt.
 */
async function DateStub({ timing, startsAt }: { timing: string; startsAt: string }) {
  const locale = await getLocale()
  const d = istDateStub(new Date(startsAt), htmlLang[locale])
  return (
    <span className="flex w-16 shrink-0 flex-col items-start border-r border-border pr-3 leading-none">
      <span className="flex items-center gap-1 text-xs text-ink-600">
        {timing === 'ON_DEMAND' && <Zap aria-hidden="true" className="size-3 text-warning-700" />}
        {d.weekday}
      </span>
      <span className="font-display text-3xl leading-none font-semibold tabular-nums">{d.day}</span>
      <span className="text-xs text-ink-600">{d.month}</span>
      <span className="mt-1.5 text-xs font-medium whitespace-nowrap tabular-nums">{d.time}</span>
    </span>
  )
}

function Row({
  href,
  stub,
  title,
  badges,
  meta,
  price,
}: {
  href: string
  stub: ReactNode
  title: ReactNode
  badges: ReactNode
  meta: ReactNode
  price: ReactNode
}) {
  return (
    <Link
      href={href}
      className="group flex items-stretch gap-4 py-4 transition-colors hover:bg-surface-muted motion-reduce:transition-none sm:-mx-3 sm:rounded-md sm:px-3"
    >
      {stub}
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 font-semibold">{title}</span>
          {price && <span aria-hidden="true" className="hidden leader sm:block" />}
          {price && (
            <span className="ml-auto shrink-0 font-display text-lg font-semibold sm:ml-0">
              {price}
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-2">{badges}</span>
        <span className="text-sm text-ink-600">{meta}</span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-5 shrink-0 self-center text-ink-600 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  )
}

/** One booking in the customer's lists. Open requests go to the thread, the rest to the booking. */
export async function BookingListItem({ booking }: { booking: CustomerBookingItem }) {
  const t = await getT()
  const href = ['REQUESTED', 'NEGOTIATING'].includes(booking.status)
    ? `/bookings/${booking.id}/negotiate`
    : `/bookings/${booking.id}`
  return (
    <Row
      href={href}
      stub={<DateStub timing={booking.timing} startsAt={booking.startsAt} />}
      title={booking.serviceName}
      badges={
        <>
          <Badge tone={statusTone(booking.status)}>{statusBadgeLabel(booking.status, t)}</Badge>
          {booking.needsAction && <Badge tone="accent">{t('bookingList.needsAnswer')}</Badge>}
        </>
      }
      meta={
        <>
          {booking.workerName} · {booking.code}
        </>
      }
      price={booking.pricePaise !== null ? <Money paise={booking.pricePaise} /> : null}
    />
  )
}

/** One assigned job in the professional's lists (no address: that is on the job page). */
export async function JobCard({ job }: { job: WorkerJobItem }) {
  const t = await getT()
  return (
    <Row
      href={`/worker/bookings/${job.id}`}
      stub={<DateStub timing={job.timing} startsAt={job.startsAt} />}
      title={t('wreq.forCustomer', { service: job.serviceName, name: job.customerFirstName })}
      badges={
        <>
          <Badge tone={statusTone(job.status)}>{statusBadgeLabel(job.status, t)}</Badge>
          {job.chargePending && <Badge tone="warning">{t('wjobs.chargeAwaiting')}</Badge>}
        </>
      }
      meta={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1">
            <MapPin aria-hidden="true" className="size-4" />
            {job.localityLabel}
          </span>
          <span>{job.code}</span>
        </span>
      }
      price={job.pricePaise !== null ? <Money paise={job.pricePaise} /> : null}
    />
  )
}
