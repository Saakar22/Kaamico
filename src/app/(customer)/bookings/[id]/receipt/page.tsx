import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PrintButton } from '@/components/domain/payments/print-button'
import { SimulationBadge } from '@/components/domain/trust-badges'
import { Logo } from '@/components/brand/logo'
import { Card, CardContent } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { AppError } from '@/lib/errors'
import { formatIstDateTime } from '@/lib/time'
import { requirePageActor } from '@/modules/auth/page-guards'
import type { Actor } from '@/modules/auth/types'
import { getReceipt } from '@/modules/payments/receipts'

export const instant = false

export const metadata: Metadata = { title: 'Receipt' }

async function load(actor: Actor, id: string) {
  try {
    return await getReceipt(actor, id)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

/** Printable booking receipt (§10.11). Not a GST tax invoice. */
export default async function ReceiptPage({ params }: PageProps<'/bookings/[id]/receipt'>) {
  const actor = await requirePageActor()
  const r = await load(actor, (await params).id)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      <Card>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <Logo />
            <div className="text-right text-sm">
              <h1 className="font-display text-xl font-bold">Receipt</h1>
              <p className="font-mono">{r.number}</p>
              <p className="text-ink-600">{formatIstDateTime(new Date(r.issuedAt))}</p>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-600">Booking</dt>
            <dd>
              {r.bookingCode} · {r.serviceName}
            </dd>
            <dt className="text-ink-600">Customer</dt>
            <dd>{r.customerName}</dd>
            <dt className="text-ink-600">Professional</dt>
            <dd>{r.workerName}</dd>
            <dt className="text-ink-600">Area</dt>
            <dd>{r.locality}</dd>
            {r.completedAt && (
              <>
                <dt className="text-ink-600">Completed</dt>
                <dd>{formatIstDateTime(new Date(r.completedAt))}</dd>
              </>
            )}
          </dl>
          <table className="w-full text-sm">
            <caption className="sr-only">Charges</caption>
            <thead>
              <tr className="border-b border-border text-left text-ink-600">
                <th scope="col" className="py-2 font-medium">
                  Item
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {r.lineItems.map((item, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="py-2">{item.label}</td>
                  <td className="py-2 text-right">
                    <Money paise={item.amountPaise} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-base font-semibold">
                <th scope="row" className="py-2 text-left">
                  Total paid
                </th>
                <td className="py-2 text-right">
                  <Money paise={r.totalPaise} />
                </td>
              </tr>
              {r.platformFeePaise !== null && (
                <tr className="text-ink-600">
                  <th scope="row" className="py-1 text-left font-normal">
                    Kaamico fee (from the professional&apos;s share)
                  </th>
                  <td className="py-1 text-right">
                    <Money paise={r.platformFeePaise} />
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            Paid with: {r.paidWith}
            {r.simulated && <SimulationBadge label="Simulated: no money moved" />}
          </p>
          <p className="text-xs text-ink-600">
            This is a booking receipt, not a GST tax invoice. The price was agreed between you and
            the professional before the job started.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
