import { CalendarCheck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { BookingListItem } from '@/components/domain/booking/booking-list-item'
import { LinkTabs } from '@/components/patterns/link-tabs'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getLocale, getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import { requirePageActor } from '@/modules/auth/page-guards'
import { CUSTOMER_TABS, listCustomerBookings, type CustomerTab } from '@/modules/bookings/lists'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('bookingList.metaTitle') }
}

const LABELS: Record<CustomerTab, MessageKey> = {
  active: 'bookingList.tabActive',
  upcoming: 'bookingList.tabUpcoming',
  past: 'bookingList.tabPast',
  cancelled: 'bookingList.tabCancelled',
}

const EMPTY: Record<CustomerTab, MessageKey> = {
  active: 'bookingList.emptyActive',
  upcoming: 'bookingList.emptyUpcoming',
  past: 'bookingList.emptyPast',
  cancelled: 'bookingList.emptyCancelled',
}

export default async function BookingsPage({ searchParams }: PageProps<'/[lang]/bookings'>) {
  const actor = await requirePageActor('CUSTOMER')
  const { tab: rawTab, cursor: rawCursor } = await searchParams
  const tab = CUSTOMER_TABS.find((t) => t === rawTab) ?? 'active'
  const cursor = typeof rawCursor === 'string' ? rawCursor : null
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const { bookings, nextCursor } = await listCustomerBookings(
    actor,
    { tab, cursor },
    new Date(),
    locale,
  )

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('bookingList.title')} />
      <LinkTabs
        label={t('bookingList.tabs')}
        current={tab}
        tabs={CUSTOMER_TABS.map((key) => ({
          key,
          label: t(LABELS[key]),
          href: `/bookings?tab=${key}`,
        }))}
      />
      {bookings.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarCheck}
            title={cursor ? t('bookingList.noMore') : t('bookingList.nothing')}
            description={t(EMPTY[tab])}
            action={
              tab === 'active' && !cursor ? (
                <Button asChild>
                  <Link href="/services">{t('bookingList.bookFirst')}</Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul
          className="flex flex-col divide-y divide-border rounded-xl bg-surface px-4 shadow-[var(--shadow-lift)] ring-1 ring-border sm:px-6"
          aria-label={t('bookingList.listLabel', { tab: t(LABELS[tab]) })}
        >
          {bookings.map((b) => (
            <li key={b.id}>
              <BookingListItem booking={b} />
            </li>
          ))}
        </ul>
      )}
      {nextCursor && (
        <Button asChild variant="secondary" className="self-center">
          <Link href={`/bookings?tab=${tab}&cursor=${nextCursor}`}>
            {t('bookingList.showOlder')}
          </Link>
        </Button>
      )}
    </div>
  )
}
