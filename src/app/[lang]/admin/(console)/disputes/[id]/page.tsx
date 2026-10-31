import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DisputeResolutionForm } from '@/components/domain/admin/dispute-resolution-form'
import { SimulationBadge } from '@/components/domain/trust-badges'
import { PageHeader } from '@/components/patterns/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { AppError } from '@/lib/errors'
import { formatIstDateTime } from '@/lib/time'
import { requirePageActor } from '@/modules/auth/page-guards'
import { getAdminDispute } from '@/modules/disputes/disputes'
import { DISPUTE_OUTCOME_LABELS, DISPUTE_REASON_LABELS } from '@/modules/disputes/labels'

export const instant = false

export const metadata: Metadata = { title: 'Reported problem' }

const PROVIDER: Record<string, string> = { CASH: 'Cash', SIMULATED: 'Online', RAZORPAY: 'Razorpay' }

async function load(id: string) {
  try {
    return await getAdminDispute(id)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

export default async function AdminDisputePage({
  params,
}: PageProps<'/[lang]/admin/disputes/[id]'>) {
  await requirePageActor('ADMIN')
  const d = await load((await params).id)
  const open = d.status === 'OPEN' || d.status === 'UNDER_REVIEW'
  const refundable = d.payment ? d.payment.amountPaise - d.payment.refundedPaise : 0
  const who = (by: string) =>
    by === 'CUSTOMER'
      ? `Customer (${d.customerName ?? '–'})`
      : by === 'WORKER'
        ? `Professional (${d.workerName ?? '–'})`
        : 'Kaamico'

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Link
        href="/admin/disputes"
        className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Reported problems
      </Link>
      <PageHeader
        title={`${DISPUTE_REASON_LABELS[d.reason]} · ${d.booking.code}`}
        description={`Reported by the ${d.raisedBy === 'CUSTOMER' ? 'customer' : 'professional'} on ${formatIstDateTime(new Date(d.createdAt))}`}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">What they said</h2>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="whitespace-pre-line">{d.description}</p>
              {d.notes.length > 0 && (
                <ul className="flex flex-col gap-2 border-t border-border pt-3" aria-label="Notes">
                  {d.notes.map((n) => (
                    <li key={n.id} className="text-sm">
                      <span className="font-medium">{who(n.by)}:</span> {n.note}
                      <span className="ml-2 text-xs text-ink-600">
                        {formatIstDateTime(new Date(n.createdAt))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{open ? 'Decision' : 'Outcome'}</h2>
            </CardHeader>
            <CardContent>
              {open ? (
                <DisputeResolutionForm
                  disputeId={d.id}
                  version={d.version}
                  refundablePaise={refundable}
                  paid={!!d.payment && refundable > 0}
                />
              ) : (
                <div className="flex flex-col gap-1" role="status">
                  <p className="font-medium">
                    {d.outcome ? DISPUTE_OUTCOME_LABELS[d.outcome] : d.status.toLowerCase()}
                    {d.refundedPaise > 0 && (
                      <>
                        {' · '}
                        <Money paise={d.refundedPaise} /> refunded
                      </>
                    )}
                  </p>
                  {d.resolutionNote && <p>{d.resolutionNote}</p>}
                  {d.resolvedAt && (
                    <p className="text-sm text-ink-600">
                      {formatIstDateTime(new Date(d.resolvedAt))}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <aside className="flex flex-col gap-4" aria-label="Booking">
          <Card>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Link
                href={`/admin/bookings/${d.booking.id}`}
                className="font-semibold text-brand-700 underline"
              >
                {d.booking.code}: full history
              </Link>
              <p>{d.booking.serviceName}</p>
              <p>
                Status: <Badge>{d.booking.status.toLowerCase().replace('_', ' ')}</Badge>
                {open && (
                  <span className="block text-xs text-ink-600">
                    Was {d.previousBookingStatus.toLowerCase().replace('_', ' ')} before the report
                  </span>
                )}
              </p>
              <p>Customer: {d.customerName ?? '–'}</p>
              <p>Professional: {d.workerName ?? '–'}</p>
              {d.booking.finalAmountPaise !== null && (
                <p>
                  Job total: <Money paise={d.booking.finalAmountPaise} />
                </p>
              )}
              {d.payment ? (
                <p className="flex flex-wrap items-center gap-2">
                  Paid {PROVIDER[d.payment.provider] ?? d.payment.provider}:{' '}
                  <Money paise={d.payment.amountPaise} />
                  {d.payment.provider === 'SIMULATED' && <SimulationBadge />}
                  {d.payment.refundedPaise > 0 && (
                    <span className="text-ink-600">
                      (<Money paise={d.payment.refundedPaise} /> refunded)
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-ink-600">Not paid yet</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
