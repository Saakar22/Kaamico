import { CalendarCheck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { BookingListItem } from '@/components/domain/booking/booking-list-item'
import { LinkTabs } from '@/components/patterns/link-tabs'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requirePageActor } from '@/modules/auth/page-guards'
import { CUSTOMER_TABS, listCustomerBookings, type CustomerTab } from '@/modules/bookings/lists'

export const instant = false

export const metadata: Metadata = { title: 'Your bookings' }

const LABELS: Record<CustomerTab, string> = {
  active: 'Active',
  upcoming: 'Upcoming',
  past: 'Past',
  cancelled: 'Cancelled',
}

const EMPTY: Record<CustomerTab, string> = {
  active: 'Requests and jobs in progress appear here.',
  upcoming: 'Confirmed bookings appear here until the day of the job.',
  past: 'Finished jobs appear here.',
  cancelled: 'Cancelled and expired requests appear here.',
}

export default async function BookingsPage({ searchParams }: PageProps<'/bookings'>) {
  const actor = await requirePageActor('CUSTOMER')
  const { tab: rawTab, cursor: rawCursor } = await searchParams
  const tab = CUSTOMER_TABS.find((t) => t === rawTab) ?? 'active'
  const cursor = typeof rawCursor === 'string' ? rawCursor : null
  const { bookings, nextCursor } = await listCustomerBookings(actor, { tab, cursor })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Your bookings" />
      <LinkTabs
        label="Booking types"
        current={tab}
        tabs={CUSTOMER_TABS.map((t) => ({ key: t, label: LABELS[t], href: `/bookings?tab=${t}` }))}
      />
      {bookings.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarCheck}
            title={cursor ? 'No more bookings' : 'Nothing here yet'}
            description={EMPTY[tab]}
            action={
              tab === 'active' && !cursor ? (
                <Button asChild>
                  <Link href="/services">Book your first service</Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={`${LABELS[tab]} bookings`}>
          {bookings.map((b) => (
            <li key={b.id}>
              <BookingListItem booking={b} />
            </li>
          ))}
        </ul>
      )}
      {nextCursor && (
        <Button asChild variant="secondary" className="self-center">
          <Link href={`/bookings?tab=${tab}&cursor=${nextCursor}`}>Show older</Link>
        </Button>
      )}
    </div>
  )
}
