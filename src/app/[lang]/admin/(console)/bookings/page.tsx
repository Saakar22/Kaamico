import { ClipboardList } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { statusBadgeLabel, statusTone } from '@/components/domain/negotiation/booking-status'
import { PageHeader } from '@/components/patterns/page-header'
import { Pager } from '@/components/patterns/pager'
import { EmptyState } from '@/components/patterns/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Money } from '@/components/ui/money'
import { Table, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIstDateTime } from '@/lib/time'
import { adminBookingQuery, listAdminBookings } from '@/modules/admin/bookings'
import { requirePageActor } from '@/modules/auth/page-guards'
import { BOOKING_STATUSES } from '@/modules/bookings/state-machine'

export const instant = false

export const metadata: Metadata = { title: 'Bookings' }

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

export default async function AdminBookingsPage({
  searchParams,
}: PageProps<'/[lang]/admin/bookings'>) {
  await requirePageActor('ADMIN')
  const raw = await searchParams
  const params = {
    status: one(raw.status),
    q: one(raw.q),
    city: one(raw.city),
    from: one(raw.from),
    to: one(raw.to),
  }
  const parsed = adminBookingQuery.safeParse({ ...params, page: one(raw.page) })
  const result = parsed.success ? await listAdminBookings(parsed.data) : null

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Bookings" description="Every booking, newest first." />
      <form
        method="get"
        className="grid gap-3 rounded-md border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] lg:items-end"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Search
          <Input name="q" defaultValue={params.q} placeholder="Code, name or phone" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <NativeSelect name="status" defaultValue={params.status ?? ''}>
            <option value="">Any</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusBadgeLabel(s)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          City
          <NativeSelect name="city" defaultValue={params.city ?? ''}>
            <option value="">Any</option>
            <option>Pune</option>
            <option>Bengaluru</option>
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Created from
          <Input type="date" name="from" defaultValue={params.from} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          to
          <Input type="date" name="to" defaultValue={params.to} />
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {!result ? (
        <p role="alert" className="text-danger-700">
          Some filters are not valid. Check the dates.
        </p>
      ) : result.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No bookings match"
            description="Try other filters."
          />
        </Card>
      ) : (
        <Table label="Bookings">
          <THead>
            <tr>
              <TH>Booking</TH>
              <TH>Status</TH>
              <TH>Customer</TH>
              <TH>Professional</TH>
              <TH>City</TH>
              <TH>When</TH>
              <TH className="text-right">Price</TH>
            </tr>
          </THead>
          <tbody>
            {result.items.map((b) => (
              <TR key={b.id}>
                <TD>
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {b.code}
                  </Link>
                  <div className="text-xs text-ink-600">{b.serviceName}</div>
                </TD>
                <TD>
                  <Badge tone={statusTone(b.status)}>{statusBadgeLabel(b.status)}</Badge>
                </TD>
                <TD>{b.customerName}</TD>
                <TD>{b.workerName}</TD>
                <TD>{b.city}</TD>
                <TD className="whitespace-nowrap">{formatIstDateTime(new Date(b.startsAt))}</TD>
                <TD className="text-right">
                  {b.pricePaise !== null ? <Money paise={b.pricePaise} /> : '–'}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      {result && (
        <Pager path="/admin/bookings" params={params} page={result.page} hasMore={result.hasMore} />
      )}
    </div>
  )
}
