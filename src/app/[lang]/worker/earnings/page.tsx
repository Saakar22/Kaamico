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
import { htmlLang } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import type { MessageKey, Translate } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import { formatINR } from '@/lib/money'
import { formatIstDateTime } from '@/lib/time'
import { workerAnalytics } from '@/modules/analytics/worker'
import { earningsSummary, listLedger, PERIODS, type Period } from '@/modules/ledger/earnings'
import { listPayouts, payoutAvailability, type PayoutView } from '@/modules/ledger/payouts'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('wearn.metaTitle') }
}

const PERIOD_LABEL: Record<Period, MessageKey> = {
  week: 'wearn.week',
  month: 'wearn.month',
  all: 'wearn.all',
}
const TYPE_LABEL: Record<string, MessageKey> = {
  JOB_EARNING: 'wearn.typeJob',
  COMMISSION: 'wearn.typeFee',
  CASH_COLLECTED: 'wearn.typeCash',
  ADJUSTMENT: 'wearn.typeAdjustment',
  REFUND_CLAWBACK: 'wearn.typeRefund',
  PAYOUT: 'wearn.typePayout',
}
const PAYOUT_STATUS: Record<
  PayoutView['status'],
  { label: MessageKey; tone: 'success' | 'info' | 'danger' }
> = {
  REQUESTED: { label: 'wearn.statusRequested', tone: 'info' },
  PROCESSING: { label: 'wearn.statusProcessing', tone: 'info' },
  PAID: { label: 'wearn.statusPaid', tone: 'success' },
  FAILED: { label: 'wearn.statusFailed', tone: 'danger' },
}

const jobs = (n: number, t: Translate) =>
  t(n === 1 ? 'wearn.jobOne' : 'wearn.jobOther', { count: n })

/** Gross, fee, net and balance straight from the ledger (§5 `/worker/earnings`). */
export default async function EarningsPage({ searchParams }: PageProps<'/[lang]/worker/earnings'>) {
  const actor = await requireWorkerPage()
  const { period: rawPeriod, cursor: rawCursor } = await searchParams
  const period = PERIODS.find((p) => p === rawPeriod) ?? 'week'
  const cursor = typeof rawCursor === 'string' ? rawCursor : null
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const lang = htmlLang[locale]
  const weekTick = new Intl.DateTimeFormat(lang, {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
  })
  const periodLabel = t(PERIOD_LABEL[period])
  const [summary, ledger, payouts, ready, trends] = await Promise.all([
    earningsSummary(actor.workerId, period),
    listLedger(actor.workerId, cursor),
    listPayouts(actor.workerId),
    payoutAvailability(actor.workerId),
    workerAnalytics(actor.workerId, period, new Date(), 8, locale),
  ])
  const { requests } = trends
  const answered = requests.won + requests.declined + requests.missed
  const owed = summary.balancePaise < 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('wearn.title')}
        description={t('wearn.description')}
        actions={<SimulationBadge label={t('wearn.simulated')} />}
      />

      <Card>
        <CardContent className="flex flex-col gap-2">
          <span className="text-sm text-ink-600">{t('wearn.balance')}</span>
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
              ? t('wearn.owed')
              : summary.balancePaise > 0
                ? t('wearn.owes')
                : t('wearn.settled')}
          </p>
          {ready.onHoldPaise > 0 && (
            <p className="text-sm text-ink-600">
              <Money paise={ready.onHoldPaise} /> {t('wearn.onHold')}
            </p>
          )}
        </CardContent>
      </Card>

      <LinkTabs
        label={t('wearn.period')}
        current={period}
        tabs={PERIODS.map((p) => ({
          key: p,
          label: t(PERIOD_LABEL[p]),
          href: `/worker/earnings?period=${p}`,
        }))}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t('wearn.jobsPaid')} value={summary.jobs} />
        <StatTile
          label={t('wearn.jobValue')}
          value={<Money paise={summary.grossPaise} />}
          hint={t('wearn.customersPaid')}
        />
        <StatTile label={t('wearn.fee')} value={<Money paise={summary.commissionPaise} />} />
        <StatTile
          label={t('wearn.earned')}
          value={<Money paise={summary.netPaise} />}
          hint={
            summary.cashCollectedPaise > 0 ? (
              <>
                <Money paise={summary.cashCollectedPaise} /> {t('wearn.ofItCash')}
              </>
            ) : undefined
          }
        />
      </div>

      <section aria-labelledby="trends-title" className="flex flex-col gap-3">
        <h2 id="trends-title" className="font-display text-xl font-semibold">
          {t('wearn.howDoing')}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent>
              <ColumnChart
                title={t('wearn.byWeek')}
                unit="paise"
                valueHeader={t('wearn.earned')}
                detailHeader={t('wearn.jobs')}
                columns={trends.weeks.map((w) => {
                  const tick = weekTick.format(new Date(w.weekStart))
                  return {
                    key: w.weekStart,
                    tick,
                    name: t('wearn.weekOf', { date: tick }),
                    value: w.netPaise,
                    display: formatINR(w.netPaise),
                    detail: jobs(w.jobs, t),
                  }
                })}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-5">
              {trends.byService.length === 0 ? (
                <p className="text-sm text-ink-600">
                  {period === 'all'
                    ? t('wearn.noJobsYet')
                    : t('wearn.noJobsPeriod', { period: periodLabel.toLowerCase() })}
                </p>
              ) : (
                <BarList
                  title={t('wearn.byService', { period: periodLabel.toLowerCase() })}
                  rows={trends.byService.map((s) => ({
                    key: s.serviceId,
                    label: s.name,
                    detail: jobs(s.jobs, t),
                    value: s.netPaise,
                    display: formatINR(s.netPaise),
                  }))}
                />
              )}
              <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
                <StatTile
                  label={t('wearn.requestsLast', { days: requests.days })}
                  value={requests.received}
                />
                <StatTile
                  label={t('wearn.booked')}
                  value={requests.won}
                  hint={
                    answered > 0
                      ? t('wearn.bookedShare', {
                          percent: Math.round((requests.won / answered) * 100),
                        })
                      : undefined
                  }
                />
                <StatTile
                  label={t('wearn.declinedMissed')}
                  value={requests.declined + requests.missed}
                  hint={
                    requests.missed > 0 ? t('wearn.missed', { count: requests.missed }) : undefined
                  }
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="ledger-title" className="flex flex-col gap-3">
        <h2 id="ledger-title" className="font-display text-xl font-semibold">
          {t('wearn.ledger')}
        </h2>
        {ledger.entries.length === 0 ? (
          <Card>
            <EmptyState
              icon={Wallet}
              title={t('wearn.noEntries')}
              description={t('wearn.noEntriesBody')}
            />
          </Card>
        ) : (
          <Table label={t('wearn.entries')}>
            <THead>
              <tr>
                <TH>{t('wearn.date')}</TH>
                <TH>{t('wearn.type')}</TH>
                <TH>{t('wearn.details')}</TH>
                <TH className="text-right">{t('wearn.amount')}</TH>
              </tr>
            </THead>
            <tbody>
              {ledger.entries.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap">
                    {formatIstDateTime(new Date(e.createdAt), lang)}
                  </TD>
                  <TD>{TYPE_LABEL[e.type] ? t(TYPE_LABEL[e.type]) : e.type}</TD>
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
              {t('wearn.showOlder')}
            </Link>
          </Button>
        )}
      </section>

      <section aria-labelledby="payouts-title" className="flex flex-col gap-3">
        <h2 id="payouts-title" className="font-display text-xl font-semibold">
          {t('wearn.payouts')}
        </h2>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-ink-600">
              {t('wearn.ready')}{' '}
              <span className="font-semibold text-ink-900">
                <Money paise={ready.availablePaise} />
              </span>
            </p>
            {ready.openPayoutId ? (
              <p className="text-sm text-ink-600">{t('wearn.onItsWay')}</p>
            ) : ready.availablePaise >= ready.minimumPaise ? (
              <PayoutRequest
                availablePaise={ready.availablePaise}
                minimumPaise={ready.minimumPaise}
              />
            ) : (
              <p className="text-sm text-ink-600">
                {t('wearn.minimum', { amount: formatINR(ready.minimumPaise) })}
              </p>
            )}
          </CardContent>
        </Card>
        {payouts.length === 0 ? (
          <p className="text-ink-600">{t('wearn.noPayouts')}</p>
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
                    {formatIstDateTime(new Date(p.paidAt ?? p.requestedAt), lang)}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </span>
                  {p.failureReason && (
                    <span className="text-xs text-danger-700">
                      {t('wearn.backInBalance', { reason: p.failureReason })}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={PAYOUT_STATUS[p.status].tone}>
                    {t(PAYOUT_STATUS[p.status].label)}
                  </Badge>
                  {p.mode === 'SIMULATED' && <SimulationBadge label={t('wearn.simulatedPayout')} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
