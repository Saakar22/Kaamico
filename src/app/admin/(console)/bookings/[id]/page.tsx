import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReasonActionDialog } from '@/components/domain/admin/reason-action-dialog'
import { BookingTimeline } from '@/components/domain/booking/booking-timeline'
import { PriceBreakdown } from '@/components/domain/booking/price-breakdown'
import { statusBadgeLabel, statusTone } from '@/components/domain/negotiation/booking-status'
import { SimulationBadge } from '@/components/domain/trust-badges'
import { PageHeader } from '@/components/patterns/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { Table, TD, TH, THead, TR } from '@/components/ui/table'
import { AppError } from '@/lib/errors'
import { formatIstDateTime } from '@/lib/time'
import { getAdminBooking } from '@/modules/admin/bookings'
import { requirePageActor } from '@/modules/auth/page-guards'

export const instant = false

export const metadata: Metadata = { title: 'Booking' }

const fmt = (at: string) => formatIstDateTime(new Date(at))

async function load(id: string) {
  try {
    return await getAdminBooking(id)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

/** Everything about one booking, read-only except for an audited cancel (§4.4 step 6). */
export default async function AdminBookingPage({ params }: PageProps<'/admin/bookings/[id]'>) {
  await requirePageActor('ADMIN')
  const b = await load((await params).id)
  const address = [
    b.address.line1,
    b.address.line2,
    b.address.landmark,
    b.address.locality,
    b.address.city,
    b.address.pincode,
  ]
    .filter(Boolean)
    .join(', ')
  const workerFirst = b.worker.name.split(' ')[0]

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/bookings"
        className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        All bookings
      </Link>
      <PageHeader
        title={`${b.code} · ${b.serviceName}`}
        description={`Created ${fmt(b.createdAt)}`}
        actions={
          b.cancellable ? (
            <ReasonActionDialog
              label="Cancel booking"
              title={`Cancel ${b.code}?`}
              description="Both the customer and the professional are told, with your reason."
              endpoint={`/api/v1/admin/bookings/${b.id}/cancel`}
              body={{ expectedVersion: b.version }}
              reasonLabel="Reason (shown to both sides)"
              success="Booking cancelled"
            />
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(b.status)}>{statusBadgeLabel(b.status)}</Badge>
        {b.cancelledBy && (
          <span className="text-sm text-ink-600">
            Cancelled by {b.cancelledBy.toLowerCase()}
            {b.cancellationReason ? `: ${b.cancellationReason}` : ''}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardContent>
              <BookingTimeline
                history={b.history}
                status={b.status}
                viewer="customer"
                counterpartName={workerFirst}
              />
            </CardContent>
          </Card>

          <section aria-labelledby="offers-title" className="flex flex-col gap-3">
            <h2 id="offers-title" className="font-semibold">
              Offers
            </h2>
            {b.offers.length === 0 ? (
              <p className="text-sm text-ink-600">No offers.</p>
            ) : (
              <Table label="Offers">
                <THead>
                  <tr>
                    <TH>Round</TH>
                    <TH>From</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Status</TH>
                    <TH>Note</TH>
                    <TH>At</TH>
                  </tr>
                </THead>
                <tbody>
                  {b.offers.map((o) => (
                    <TR key={o.id}>
                      <TD>{o.round}</TD>
                      <TD>{o.offeredBy === 'CUSTOMER' ? 'Customer' : 'Professional'}</TD>
                      <TD className="text-right">
                        <Money paise={o.amountPaise} />
                      </TD>
                      <TD>{o.status.toLowerCase()}</TD>
                      <TD>{o.note ?? '–'}</TD>
                      <TD className="whitespace-nowrap">{fmt(o.createdAt)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </section>

          <section aria-labelledby="payments-title" className="flex flex-col gap-3">
            <h2 id="payments-title" className="font-semibold">
              Payments
            </h2>
            {b.payments.length === 0 ? (
              <p className="text-sm text-ink-600">No payments.</p>
            ) : (
              <Table label="Payments">
                <THead>
                  <tr>
                    <TH>Method</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Started</TH>
                    <TH>Captured</TH>
                  </tr>
                </THead>
                <tbody>
                  {b.payments.map((p) => (
                    <TR key={p.id}>
                      <TD>
                        {p.provider.toLowerCase()}
                        {p.provider === 'SIMULATED' && <SimulationBadge className="ml-2" />}
                      </TD>
                      <TD>
                        {p.status.toLowerCase()}
                        {p.failureReason && (
                          <div className="text-xs text-ink-600">{p.failureReason}</div>
                        )}
                      </TD>
                      <TD className="text-right">
                        <Money paise={p.amountPaise} />
                      </TD>
                      <TD className="whitespace-nowrap">{fmt(p.createdAt)}</TD>
                      <TD className="whitespace-nowrap">
                        {p.capturedAt ? fmt(p.capturedAt) : '–'}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
            {b.receiptNumber && (
              <Link
                href={`/bookings/${b.id}/receipt`}
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                Receipt {b.receiptNumber}
              </Link>
            )}
          </section>

          <section aria-labelledby="messages-title" className="flex flex-col gap-3">
            <h2 id="messages-title" className="font-semibold">
              Messages
            </h2>
            {b.messages.length === 0 ? (
              <p className="text-sm text-ink-600">No messages.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {b.messages.map((m) => (
                  <li key={m.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex flex-wrap gap-x-2 text-xs text-ink-600">
                      <span className="font-medium text-ink-900">
                        {m.from === 'CUSTOMER' ? b.customer.name : b.worker.name}
                      </span>
                      <span>{fmt(m.createdAt)}</span>
                      {m.redacted && <Badge tone="warning">Contact details hidden</Badge>}
                    </div>
                    <p className="mt-1">{m.body}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4" aria-label="Booking details">
          <Card>
            <CardContent className="flex flex-col gap-3 text-sm">
              <h2 className="font-semibold">People</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
                <dt className="text-ink-600">Customer</dt>
                <dd>
                  <Link
                    href={`/admin/users?q=${encodeURIComponent(b.customer.phone ?? b.customer.name)}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {b.customer.name}
                  </Link>
                  <div className="text-ink-600">{b.customer.phone}</div>
                </dd>
                <dt className="text-ink-600">Professional</dt>
                <dd>
                  <Link
                    href={`/admin/users?q=${encodeURIComponent(b.worker.phone ?? b.worker.name)}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {b.worker.name}
                  </Link>
                  <div className="text-ink-600">
                    {b.worker.phone} · {b.worker.assigned ? 'assigned' : 'invited'}
                  </div>
                </dd>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-3 text-sm">
              <h2 className="font-semibold">Job</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
                <dt className="text-ink-600">When</dt>
                <dd>
                  {b.timing === 'ON_DEMAND' ? 'On demand · ' : ''}
                  {fmt(b.slot?.start ?? b.requestedStart)}
                </dd>
                <dt className="text-ink-600">Where</dt>
                <dd>{address}</dd>
                <dt className="text-ink-600">Start code tries</dt>
                <dd>{b.startCodeAttempts} of 5 wrong</dd>
                <dt className="text-ink-600">Commission</dt>
                <dd>{b.commissionBps / 100}%</dd>
              </dl>
              {b.description && <p>“{b.description}”</p>}
              <div className="border-t border-border pt-3">
                <PriceBreakdown price={b.price} charges={b.charges} />
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
