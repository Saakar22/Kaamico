import { IndianRupee } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { RefundDialog } from '@/components/domain/admin/refund-dialog'
import { SimulationBadge } from '@/components/domain/trust-badges'
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
import { requirePageActor } from '@/modules/auth/page-guards'
import { adminPaymentQuery, listAdminPayments } from '@/modules/payments/refunds'

export const instant = false

export const metadata: Metadata = { title: 'Payments' }

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
const PROVIDER: Record<string, string> = { CASH: 'Cash', SIMULATED: 'Online', RAZORPAY: 'Razorpay' }
const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'danger' | 'info'> = {
  CAPTURED: 'success',
  PARTIALLY_REFUNDED: 'warning',
  REFUNDED: 'neutral',
  PENDING: 'info',
  CREATED: 'info',
  FAILED: 'danger',
}
const REFUNDABLE = ['CAPTURED', 'PARTIALLY_REFUNDED']

export default async function AdminPaymentsPage({
  searchParams,
}: PageProps<'/[lang]/admin/payments'>) {
  await requirePageActor('ADMIN')
  const raw = await searchParams
  const params = { q: one(raw.q), status: one(raw.status), provider: one(raw.provider) }
  const parsed = adminPaymentQuery.safeParse({ ...params, page: one(raw.page) })
  const result = parsed.success ? await listAdminPayments(parsed.data) : null

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Payments"
        description="Every payment attempt and its refunds. Online payments are simulated in this release."
      />
      <form
        method="get"
        className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Booking code
          <Input name="q" defaultValue={params.q} placeholder="KMC-…" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <NativeSelect name="status" defaultValue={params.status ?? ''}>
            <option value="">Any</option>
            <option value="CAPTURED">Paid</option>
            <option value="PARTIALLY_REFUNDED">Partly refunded</option>
            <option value="REFUNDED">Refunded</option>
            <option value="PENDING">Waiting</option>
            <option value="FAILED">Failed</option>
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Method
          <NativeSelect name="provider" defaultValue={params.provider ?? ''}>
            <option value="">Any</option>
            <option value="CASH">Cash</option>
            <option value="SIMULATED">Online (simulated)</option>
            <option value="RAZORPAY">Razorpay</option>
          </NativeSelect>
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {!result ? (
        <p role="alert" className="text-danger-700">
          Some filters are not valid.
        </p>
      ) : result.items.length === 0 ? (
        <Card>
          <EmptyState icon={IndianRupee} title="No payments match" />
        </Card>
      ) : (
        <Table label="Payments">
          <THead>
            <tr>
              <TH>Booking</TH>
              <TH>Amount</TH>
              <TH>Method</TH>
              <TH>Status</TH>
              <TH>Refunded</TH>
              <TH>When</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <tbody>
            {result.items.map((p) => (
              <TR key={p.id}>
                <TD>
                  <Link
                    href={`/admin/bookings/${p.booking.id}`}
                    className="font-medium text-brand-700 underline"
                  >
                    {p.booking.code}
                  </Link>
                  <div className="text-xs text-ink-600">
                    {p.customerName ?? 'Customer'} → {p.workerName ?? '–'}
                  </div>
                </TD>
                <TD>
                  <Money paise={p.amountPaise} />
                </TD>
                <TD>
                  <span className="flex items-center gap-2">
                    {PROVIDER[p.provider] ?? p.provider}
                    {p.provider === 'SIMULATED' && <SimulationBadge />}
                  </span>
                </TD>
                <TD>
                  <Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>
                    {p.status.toLowerCase().replace('_', ' ')}
                  </Badge>
                </TD>
                <TD>{p.refundedPaise > 0 ? <Money paise={p.refundedPaise} /> : '–'}</TD>
                <TD className="whitespace-nowrap">
                  {formatIstDateTime(new Date(p.capturedAt ?? p.createdAt))}
                </TD>
                <TD>
                  {REFUNDABLE.includes(p.status) && p.amountPaise > p.refundedPaise && (
                    <RefundDialog
                      paymentId={p.id}
                      bookingCode={p.booking.code}
                      refundablePaise={p.amountPaise - p.refundedPaise}
                    />
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      {result && (
        <Pager path="/admin/payments" params={params} page={result.page} hasMore={result.hasMore} />
      )}
    </div>
  )
}
