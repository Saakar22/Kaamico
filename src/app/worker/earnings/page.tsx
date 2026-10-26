import { Wallet } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { SimulationBadge } from '@/components/domain/trust-badges'
import { LinkTabs } from '@/components/patterns/link-tabs'
import { PageHeader } from '@/components/patterns/page-header'
import { StatTile } from '@/components/patterns/stat-tile'
import { EmptyState } from '@/components/patterns/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { Table, TD, TH, THead, TR } from '@/components/ui/table'
import { cn } from '@/lib/cn'
import { formatIstDateTime } from '@/lib/time'
import {
  earningsSummary,
  listLedger,
  listPayouts,
  PERIODS,
  type Period,
} from '@/modules/ledger/earnings'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export const metadata: Metadata = { title: 'Earnings' }

const PERIOD_LABEL: Record<Period, string> = {
  week: 'This week',
  month: 'This month',
  all: 'All time',
}
const TYPE_LABEL: Record<string, string> = {
  JOB_EARNING: 'Job',
  COMMISSION: 'Kaamico fee',
  CASH_COLLECTED: 'Paid to you in cash',
  ADJUSTMENT: 'Adjustment',
  REFUND_CLAWBACK: 'Refund',
  PAYOUT: 'Payout',
}

/** Gross, fee, net and balance straight from the ledger (§5 `/worker/earnings`). */
export default async function EarningsPage({ searchParams }: PageProps<'/worker/earnings'>) {
  const actor = await requireWorkerPage()
  const { period: rawPeriod, cursor: rawCursor } = await searchParams
  const period = PERIODS.find((p) => p === rawPeriod) ?? 'week'
  const cursor = typeof rawCursor === 'string' ? rawCursor : null
  const [summary, ledger, payouts] = await Promise.all([
    earningsSummary(actor.workerId, period),
    listLedger(actor.workerId, cursor),
    listPayouts(actor.workerId),
  ])
  const owed = summary.balancePaise < 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Earnings"
        description="Every job, fee and payout, as recorded."
        actions={<SimulationBadge label="Payouts are simulated: no money is transferred" />}
      />

      <Card>
        <CardContent className="flex flex-col gap-2">
          <span className="text-sm text-ink-600">Balance</span>
          <span
            className={cn(
              'font-display text-3xl font-bold tabular-nums',
              owed ? 'text-danger-700' : 'text-ink-900',
            )}
          >
            {owed && '− '}
            <Money paise={Math.abs(summary.balancePaise)} />
          </span>
          <p className="text-sm text-ink-600">
            {owed
              ? 'You owe Kaamico this in fees from cash jobs. It is taken from your next online payments.'
              : summary.balancePaise > 0
                ? 'Kaamico owes you this from online payments. Payouts are simulated in this demo.'
                : 'You are all settled up.'}
          </p>
        </CardContent>
      </Card>

      <LinkTabs
        label="Period"
        current={period}
        tabs={PERIODS.map((p) => ({
          key: p,
          label: PERIOD_LABEL[p],
          href: `/worker/earnings?period=${p}`,
        }))}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Jobs paid" value={summary.jobs} />
        <StatTile
          label="Job value"
          value={<Money paise={summary.grossPaise} />}
          hint="What customers paid"
        />
        <StatTile label="Kaamico fee" value={<Money paise={summary.commissionPaise} />} />
        <StatTile
          label="You earned"
          value={<Money paise={summary.netPaise} />}
          hint={
            summary.cashCollectedPaise > 0 ? (
              <>
                <Money paise={summary.cashCollectedPaise} /> of it was paid to you in cash
              </>
            ) : undefined
          }
        />
      </div>

      <section aria-labelledby="ledger-title" className="flex flex-col gap-3">
        <h2 id="ledger-title" className="font-display text-xl font-bold">
          Ledger
        </h2>
        {ledger.entries.length === 0 ? (
          <Card>
            <EmptyState
              icon={Wallet}
              title="No entries yet"
              description="When a customer pays for a job, its earnings and fee appear here."
            />
          </Card>
        ) : (
          <Table label="Ledger entries">
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Type</TH>
                <TH>Details</TH>
                <TH className="text-right">Amount</TH>
              </tr>
            </THead>
            <tbody>
              {ledger.entries.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap">{formatIstDateTime(new Date(e.createdAt))}</TD>
                  <TD>{TYPE_LABEL[e.type] ?? e.type}</TD>
                  <TD>
                    {e.bookingId ? (
                      <Link
                        href={`/worker/bookings/${e.bookingId}`}
                        className="text-brand-700 hover:underline"
                      >
                        {e.description}
                      </Link>
                    ) : (
                      e.description
                    )}
                  </TD>
                  <TD
                    className={cn(
                      'text-right whitespace-nowrap tabular-nums',
                      e.amountPaise < 0 ? 'text-danger-700' : 'text-success-800',
                    )}
                  >
                    {e.amountPaise < 0 ? '− ' : '+ '}
                    <Money paise={Math.abs(e.amountPaise)} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
        {ledger.nextCursor && (
          <Button asChild variant="secondary" className="self-center">
            <Link href={`/worker/earnings?period=${period}&cursor=${ledger.nextCursor}`}>
              Show older
            </Link>
          </Button>
        )}
      </section>

      <section aria-labelledby="payouts-title" className="flex flex-col gap-3">
        <h2 id="payouts-title" className="font-display text-xl font-bold">
          Payouts
        </h2>
        {payouts.length === 0 ? (
          <p className="text-ink-600">
            No payouts yet. Requesting a payout arrives in a later update.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {payouts.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3"
              >
                <span className="flex flex-col">
                  <span className="font-semibold">
                    <Money paise={p.amountPaise} />
                  </span>
                  <span className="text-xs text-ink-600">
                    {formatIstDateTime(new Date(p.paidAt ?? p.requestedAt))}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={p.status === 'PAID' ? 'success' : 'neutral'}>
                    {p.status.toLowerCase()}
                  </Badge>
                  {p.mode === 'SIMULATED' && (
                    <SimulationBadge label="Simulated: no money transferred" />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
