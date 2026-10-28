import { Wallet } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { BarList } from '@/components/charts/bar-list'
import { ColumnChart } from '@/components/charts/column-chart'
import { SimulationBadge } from '@/components/domain/trust-badges'
import { PayoutRequest } from '@/components/domain/worker/payout-request'
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
import { formatINR } from '@/lib/money'
import { formatIstDateTime } from '@/lib/time'
import { workerAnalytics } from '@/modules/analytics/worker'
import { earningsSummary, listLedger, PERIODS, type Period } from '@/modules/ledger/earnings'
import { listPayouts, payoutAvailability, type PayoutView } from '@/modules/ledger/payouts'
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
const PAYOUT_STATUS: Record<
  PayoutView['status'],
  { label: string; tone: 'success' | 'info' | 'danger' }
> = {
  REQUESTED: { label: 'Requested', tone: 'info' },
  PROCESSING: { label: 'On its way', tone: 'info' },
  PAID: { label: 'Paid', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
}

const weekTick = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
})
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** Gross, fee, net and balance straight from the ledger (§5 `/worker/earnings`). */
export default async function EarningsPage({ searchParams }: PageProps<'/worker/earnings'>) {
  const actor = await requireWorkerPage()
  const { period: rawPeriod, cursor: rawCursor } = await searchParams
  const period = PERIODS.find((p) => p === rawPeriod) ?? 'week'
  const cursor = typeof rawCursor === 'string' ? rawCursor : null
  const [summary, ledger, payouts, ready, trends] = await Promise.all([
    earningsSummary(actor.workerId, period),
    listLedger(actor.workerId, cursor),
    listPayouts(actor.workerId),
    payoutAvailability(actor.workerId),
    workerAnalytics(actor.workerId, period),
  ])
  const { requests } = trends
  const answered = requests.won + requests.declined + requests.missed
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
          {ready.onHoldPaise > 0 && (
            <p className="text-sm text-ink-600">
              <Money paise={ready.onHoldPaise} /> is on hold: a job&apos;s earnings can be paid out
              72 hours after it is paid, once the customer can no longer report a problem.
            </p>
          )}
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

      <section aria-labelledby="trends-title" className="flex flex-col gap-3">
        <h2 id="trends-title" className="font-display text-xl font-bold">
          How you are doing
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent>
              <ColumnChart
                title="You earned, by week (after Kaamico's fee)"
                unit="paise"
                valueHeader="You earned"
                detailHeader="Jobs"
                columns={trends.weeks.map((w) => {
                  const tick = weekTick.format(new Date(w.weekStart))
                  return {
                    key: w.weekStart,
                    tick,
                    name: `Week of ${tick}`,
                    value: w.netPaise,
                    display: formatINR(w.netPaise),
                    detail: plural(w.jobs, 'job'),
                  }
                })}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-5">
              {trends.byService.length === 0 ? (
                <p className="text-sm text-ink-600">
                  No paid jobs {period === 'all' ? 'yet' : PERIOD_LABEL[period].toLowerCase()}.
                </p>
              ) : (
                <BarList
                  title={`Your earnings by service, ${PERIOD_LABEL[period].toLowerCase()}`}
                  rows={trends.byService.map((s) => ({
                    key: s.serviceId,
                    label: s.name,
                    detail: plural(s.jobs, 'job'),
                    value: s.netPaise,
                    display: formatINR(s.netPaise),
                  }))}
                />
              )}
              <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
                <StatTile
                  label={`Requests, last ${requests.days} days`}
                  value={requests.received}
                />
                <StatTile
                  label="Booked with you"
                  value={requests.won}
                  hint={
                    answered > 0
                      ? `${Math.round((requests.won / answered) * 100)}% of the ones that finished`
                      : undefined
                  }
                />
                <StatTile
                  label="Declined or missed"
                  value={requests.declined + requests.missed}
                  hint={
                    requests.missed > 0
                      ? `${requests.missed} timed out or went to someone else`
                      : undefined
                  }
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

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
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-ink-600">
              Ready to pay out:{' '}
              <span className="font-semibold text-ink-900">
                <Money paise={ready.availablePaise} />
              </span>
            </p>
            {ready.openPayoutId ? (
              <p className="text-sm text-ink-600">
                Your last payout is on its way. You can ask for the next one once it arrives.
              </p>
            ) : ready.availablePaise >= ready.minimumPaise ? (
              <PayoutRequest
                availablePaise={ready.availablePaise}
                minimumPaise={ready.minimumPaise}
              />
            ) : (
              <p className="text-sm text-ink-600">
                You can ask for a payout once <Money paise={ready.minimumPaise} /> or more is ready.
              </p>
            )}
          </CardContent>
        </Card>
        {payouts.length === 0 ? (
          <p className="text-ink-600">No payouts yet.</p>
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
                  {p.failureReason && (
                    <span className="text-xs text-danger-700">
                      {p.failureReason} The amount is back in your balance.
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={PAYOUT_STATUS[p.status].tone}>{PAYOUT_STATUS[p.status].label}</Badge>
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
