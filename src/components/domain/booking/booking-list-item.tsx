import { CalendarClock, ChevronRight, MapPin, Zap } from 'lucide-react'
import Link from 'next/link'
import { statusBadgeLabel, statusTone } from '@/components/domain/negotiation/booking-status'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Money } from '@/components/ui/money'
import { formatIstDateTime } from '@/lib/time'
import type { CustomerBookingItem, WorkerJobItem } from '@/modules/bookings/lists'

function When({ timing, startsAt }: { timing: string; startsAt: string }) {
  return (
    <span className="flex items-center gap-1">
      {timing === 'ON_DEMAND' ? (
        <Zap aria-hidden="true" className="size-4" />
      ) : (
        <CalendarClock aria-hidden="true" className="size-4" />
      )}
      {formatIstDateTime(new Date(startsAt))}
    </span>
  )
}

const cardClasses =
  'flex items-center gap-3 rounded-lg border border-border bg-surface p-4 hover:border-brand-600'

/** One booking in the customer's lists. Open requests go to the thread, the rest to the booking. */
export function BookingListItem({ booking }: { booking: CustomerBookingItem }) {
  const href = ['REQUESTED', 'NEGOTIATING'].includes(booking.status)
    ? `/bookings/${booking.id}/negotiate`
    : `/bookings/${booking.id}`
  return (
    <Link href={href} className={cardClasses}>
      <Avatar name={booking.workerName} src={booking.workerPhotoUrl} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{booking.serviceName}</span>
          <Badge tone={statusTone(booking.status)}>{statusBadgeLabel(booking.status)}</Badge>
          {booking.needsAction && <Badge tone="accent">Needs your answer</Badge>}
        </span>
        <span className="text-sm text-ink-600">
          {booking.workerName} · {booking.code}
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-600">
          <When timing={booking.timing} startsAt={booking.startsAt} />
          {booking.pricePaise !== null && <Money paise={booking.pricePaise} />}
        </span>
      </div>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-600" />
    </Link>
  )
}

/** One assigned job in the professional's lists (no address: that is on the job page). */
export function JobCard({ job }: { job: WorkerJobItem }) {
  return (
    <Link href={`/worker/bookings/${job.id}`} className={cardClasses}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">
            {job.serviceName} for {job.customerFirstName}
          </span>
          <Badge tone={statusTone(job.status)}>{statusBadgeLabel(job.status)}</Badge>
          {job.chargePending && <Badge tone="warning">Charge awaiting approval</Badge>}
        </span>
        <span className="text-xs text-ink-600">{job.code}</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-600">
          <When timing={job.timing} startsAt={job.startsAt} />
          <span className="flex items-center gap-1">
            <MapPin aria-hidden="true" className="size-4" />
            {job.localityLabel}
          </span>
          {job.pricePaise !== null && <Money paise={job.pricePaise} />}
        </span>
      </div>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-600" />
    </Link>
  )
}
