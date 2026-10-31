import { CalendarCheck, CircleAlert, Clock, Repeat } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { AutoRefresh } from '@/components/domain/booking/auto-refresh'
import { BookingListItem } from '@/components/domain/booking/booking-list-item'
import { PageHeader } from '@/components/patterns/page-header'
import { RateList, RateRow } from '@/components/patterns/rate-list'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { htmlLang } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import { formatIstTime } from '@/lib/time'
import { requirePageActor } from '@/modules/auth/page-guards'
import { getCustomerDashboard } from '@/modules/bookings/lists'

// Session-dependent: always needs a server round trip, so opt out of instant validation.
export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('dashboard.metaTitle') }
}

const actionClasses =
  'flex flex-col gap-1 rounded-md border border-accent-500 bg-surface p-4 hover:border-brand-600 sm:flex-row sm:items-center sm:justify-between'

/** Needs-your-action first, then the active booking, open requests and quick rebooking (§5). */
export default async function CustomerDashboardPage() {
  const actor = await requirePageActor()
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const dash = await getCustomerDashboard(actor, new Date(), locale)
  const actions = dash.pendingOffers.length + dash.pendingCharges.length + dash.unpaid.length
  const nothing = actions === 0 && !dash.activeBooking && dash.waiting.length === 0

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh intervalMs={15_000} />
      <PageHeader
        title={t('dashboard.hi', { name: actor.name ?? '' })}
        description={
          actions > 0
            ? t(actions === 1 ? 'dashboard.actionsOne' : 'dashboard.actionsOther', {
                count: actions,
              })
            : t('dashboard.glance')
        }
        actions={<SignOutButton variant="tertiary" size="sm" />}
      />

      {actions > 0 && (
        <section aria-labelledby="actions-title" className="flex flex-col gap-3">
          <h2
            id="actions-title"
            className="flex items-center gap-2 font-display text-xl font-semibold"
          >
            <CircleAlert aria-hidden="true" className="size-5 text-warning-700" />
            {t('dashboard.needsAnswer')}
          </h2>
          <ul className="flex flex-col gap-3">
            {dash.unpaid.map((u) => (
              <li key={u.bookingId}>
                <Link href={`/bookings/${u.bookingId}`} className={actionClasses}>
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      {t('dashboard.pay', {
                        name: u.workerName.split(' ')[0],
                        service: u.serviceName.toLowerCase(),
                      })}
                    </span>
                    <span className="text-sm text-ink-600">
                      {t('dashboard.jobCompleted', { code: u.code })}
                    </span>
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
                      {t('dashboard.extraCharge', { name: c.workerName.split(' ')[0] })}
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
                      {t('dashboard.offered', { name: o.workerName.split(' ')[0] })}{' '}
                      <Money paise={o.amountPaise} />
                    </span>
                    <span className="text-sm text-ink-600">
                      {o.serviceName} · {o.code}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-sm text-warning-800">
                    <Clock aria-hidden="true" className="size-4" />
                    {t('dashboard.replyBy', {
                      time: formatIstTime(new Date(o.expiresAt), htmlLang[locale]),
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dash.activeBooking && (
        <section aria-labelledby="active-title" className="flex flex-col gap-3">
          <h2 id="active-title" className="font-display text-xl font-semibold">
            {dash.activeBooking.status === 'CONFIRMED' ? t('dashboard.next') : t('dashboard.now')}
          </h2>
          <div className="rounded-xl bg-surface px-4 shadow-[var(--shadow-lift)] ring-1 ring-border sm:px-6">
            <BookingListItem booking={dash.activeBooking} />
          </div>
        </section>
      )}

      {dash.waiting.length > 0 && (
        <section aria-labelledby="waiting-title" className="flex flex-col gap-3">
          <h2 id="waiting-title" className="font-display text-xl font-semibold">
            {t('dashboard.open')}
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-xl bg-surface px-4 shadow-[var(--shadow-lift)] ring-1 ring-border sm:px-6">
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
            title={t('dashboard.nothingTitle')}
            description={t('dashboard.nothingBody')}
            action={
              <Button asChild>
                <Link href="/services">{t('dashboard.findService')}</Link>
              </Button>
            }
          />
        </Card>
      )}

      {dash.rebook.length > 0 && (
        <section aria-labelledby="rebook-title" className="flex flex-col gap-3">
          <h2 id="rebook-title" className="font-display text-xl font-semibold">
            {t('dashboard.again')}
          </h2>
          <RateList className="sm:grid sm:grid-cols-2 sm:gap-x-10 sm:border-t-0">
            {dash.rebook.map((r) => (
              <RateRow
                key={`${r.workerId}-${r.serviceId}`}
                href={`/book/${r.serviceId}?worker=${r.workerId}`}
                className="sm:[&:nth-child(-n+2)]:border-t"
                leading={<Repeat aria-hidden="true" className="size-5 text-brand-700" />}
                label={r.serviceName}
                detail={t('dashboard.with', { name: r.workerName })}
              />
            ))}
          </RateList>
        </section>
      )}

      <Link href="/bookings" className="text-sm font-medium text-brand-700 hover:underline">
        {t('dashboard.all')}
      </Link>
    </div>
  )
}
