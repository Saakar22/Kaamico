import { Banknote } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PayoutActions } from '@/components/domain/admin/payout-actions'
import { SimulationBadge } from '@/components/domain/trust-badges'
import { PageHeader } from '@/components/patterns/page-header'
import { Pager } from '@/components/patterns/pager'
import { EmptyState } from '@/components/patterns/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/input'
import { Money } from '@/components/ui/money'
import { Table, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIstDateTime } from '@/lib/time'
import { requirePageActor } from '@/modules/auth/page-guards'
import { adminPayoutQuery, listAdminPayouts } from '@/modules/ledger/payouts'

export const instant = false

export const metadata: Metadata = { title: 'Payouts' }

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
const STATUS: Record<string, { label: string; tone: 'success' | 'info' | 'danger' | 'warning' }> = {
  REQUESTED: { label: 'Requested', tone: 'warning' },
  PROCESSING: { label: 'Processing', tone: 'info' },
  PAID: { label: 'Paid', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
}

/** Payout requests from professionals, oldest open first (§11.4). All simulated. */
export default async function AdminPayoutsPage({
  searchParams,
}: PageProps<'/[lang]/admin/payouts'>) {
  await requirePageActor('ADMIN')
  const raw = await searchParams
  const params = { status: one(raw.status) }
  const parsed = adminPayoutQuery.safeParse({ ...params, page: one(raw.page) })
  const result = parsed.success ? await listAdminPayouts(parsed.data) : null

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Payouts"
        description="Professionals ask for their earnings here. Pay the oldest requests first."
        actions={<SimulationBadge label="Simulated: no money is transferred" />}
      />
      <form
        method="get"
        className="grid gap-3 rounded-md border border-border bg-surface p-4 sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <NativeSelect name="status" defaultValue={params.status ?? ''}>
            <option value="">Any</option>
            <option value="OPEN">Waiting to be paid</option>
            <option value="REQUESTED">Requested</option>
            <option value="PROCESSING">Processing</option>
            <option value="PAID">Paid</option>
            <option value="FAILED">Failed</option>
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
          <EmptyState icon={Banknote} title="No payouts match" />
        </Card>
      ) : (
        <Table label="Payouts">
          <THead>
            <tr>
              <TH>Professional</TH>
              <TH>Amount</TH>
              <TH>Status</TH>
              <TH>Requested</TH>
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
                    href={`/professionals/${p.workerId}`}
                    className="font-medium text-brand-700 underline"
                  >
                    {p.workerName}
                  </Link>
                  {p.reference && <div className="text-xs text-ink-600">{p.reference}</div>}
                </TD>
                <TD>
                  <Money paise={p.amountPaise} />
                </TD>
                <TD>
                  <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                  {p.failureReason && (
                    <div className="mt-1 max-w-xs text-xs text-ink-600">{p.failureReason}</div>
                  )}
                </TD>
                <TD className="whitespace-nowrap">
                  {formatIstDateTime(new Date(p.requestedAt))}
                  {p.paidAt && (
                    <div className="text-xs text-ink-600">
                      Paid {formatIstDateTime(new Date(p.paidAt))}
                    </div>
                  )}
                </TD>
                <TD>
                  {(p.status === 'REQUESTED' || p.status === 'PROCESSING') && (
                    <PayoutActions payoutId={p.id} status={p.status} workerName={p.workerName} />
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      {result && (
        <Pager path="/admin/payouts" params={params} page={result.page} hasMore={result.hasMore} />
      )}
    </div>
  )
}
