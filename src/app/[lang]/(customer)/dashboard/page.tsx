import { CalendarCheck, CircleAlert, Clock, Repeat } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { AutoRefresh } from '@/components/domain/booking/auto-refresh'
import { BookingListItem } from '@/components/domain/booking/booking-list-item'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { formatIstTime } from '@/lib/time'
import { requirePageActor } from '@/modules/auth/page-guards'
import { getCustomerDashboard } from '@/modules/bookings/lists'

// Session-dependent: always needs a server round trip, so opt out of instant validation.
export const instant = false

export const metadata: Metadata = { title: 'Your dashboard' }

const actionClasses =
  'flex flex-col gap-1 rounded-lg border border-accent-500 bg-surface p-4 hover:border-brand-600 sm:flex-row sm:items-center sm:justify-between'

/** Needs-your-action first, then the active booking, open requests and quick rebooking (§5). */
export default async function CustomerDashboardPage() {
  const actor = await requirePageActor()
  const dash = await getCustomerDashboard(actor)
  const actions = dash.pendingOffers.length + dash.pendingCharges.length + dash.unpaid.length
  const nothing = actions === 0 && !dash.activeBooking && dash.waiting.length === 0

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh intervalMs={15_000} />
      <PageHeader
        title={`Hi, ${actor.name}`}
        description={
          actions > 0
            ? `${actions} ${actions === 1 ? 'thing needs' : 'things need'} your answer.`
            : 'Your bookings at a glance.'
        }
        actions={<SignOutButton />}
      />

      {actions > 0 && (
        <section aria-labelledby="actions-title" className="flex flex-col gap-3">
          <h2 id="actions-title" className="flex items-center gap-2 font-display text-xl font-bold">
            <CircleAlert aria-hidden="true" className="size-5 text-warning-700" />
            Needs your answer
          </h2>
          <ul className="flex flex-col gap-3">
            {dash.unpaid.map((u) => (
              <li key={u.bookingId}>
                <Link href={`/bookings/${u.bookingId}`} className={actionClasses}>
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      Pay {u.workerName.split(' ')[0]} for {u.serviceName.toLowerCase()}
                    </span>
                    <span className="text-sm text-ink-600">Job completed · {u.code}</span>
                  </span>
                  <span className="font-semibold">
                    <Money paise={u.totalPaise} />
                  </span>
                </Link>
              </li>
            ))}
            {dash.pendingCharges.map((c) => (
              <li key={c.chargeId}>
                <Link href={`/bookings/${c.bookingId}`} className={actionClasses}>
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      {c.workerName.split(' ')[0]} added an extra charge
                    </span>
                    <span className="text-sm text-ink-600">
                      {c.description} · {c.serviceName} · {c.code}
                    </span>
                  </span>
                  <span className="font-semibold">
                    + <Money paise={c.amountPaise} />
                  </span>
                </Link>
              </li>
            ))}
            {dash.pendingOffers.map((o) => (
              <li key={o.bookingId}>
                <Link href={`/bookings/${o.bookingId}/negotiate`} className={actionClasses}>
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      {o.workerName.split(' ')[0]} offered <Money paise={o.amountPaise} />
                    </span>
                    <span className="text-sm text-ink-600">
                      {o.serviceName} · {o.code}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-sm text-warning-800">
                    <Clock aria-hidden="true" className="size-4" />
                    Reply by {formatIstTime(new Date(o.expiresAt))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dash.activeBooking && (
        <section aria-labelledby="active-title" className="flex flex-col gap-3">
          <h2 id="active-title" className="font-display text-xl font-bold">
            {dash.activeBooking.status === 'CONFIRMED' ? 'Next booking' : 'Happening now'}
          </h2>
          <BookingListItem booking={dash.activeBooking} />
        </section>
      )}

      {dash.waiting.length > 0 && (
        <section aria-labelledby="waiting-title" className="flex flex-col gap-3">
          <h2 id="waiting-title" className="font-display text-xl font-bold">
            Open requests
          </h2>
          <ul className="flex flex-col gap-3">
            {dash.waiting.map((b) => (
              <li key={b.id}>
                <BookingListItem booking={b} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {nothing && (
        <Card>
          <EmptyState
            icon={CalendarCheck}
            title="Nothing waiting on you"
            description="Book a trusted professional nearby. You see their price before you ask."
            action={
              <Button asChild>
                <Link href="/services">Find a service</Link>
              </Button>
            }
          />
        </Card>
      )}

      {dash.rebook.length > 0 && (
        <section aria-labelledby="rebook-title" className="flex flex-col gap-3">
          <h2 id="rebook-title" className="font-display text-xl font-bold">
            Book again
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {dash.rebook.map((r) => (
              <li key={`${r.workerId}-${r.serviceId}`}>
                <Link
                  href={`/book/${r.serviceId}?worker=${r.workerId}`}
                  className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 hover:border-brand-600"
                >
                  <Repeat aria-hidden="true" className="size-5 shrink-0 text-brand-700" />
                  <span className="flex flex-col">
                    <span className="font-medium">{r.serviceName}</span>
                    <span className="text-sm text-ink-600">with {r.workerName}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link href="/bookings" className="text-sm font-medium text-brand-700 hover:underline">
        All your bookings
      </Link>
    </div>
  )
}
