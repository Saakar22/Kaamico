import type { Metadata } from 'next'
import Link from 'next/link'
import { BarList } from '@/components/charts/bar-list'
import { LinkTabs } from '@/components/patterns/link-tabs'
import { PageHeader } from '@/components/patterns/page-header'
import { StatTile } from '@/components/patterns/stat-tile'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TD, TH, THead, TR } from '@/components/ui/table'
import { requirePageActor } from '@/modules/auth/page-guards'
import { ANALYTICS_RANGES, getAdminAnalytics, type AnalyticsRange } from '@/modules/analytics/admin'
import { repeatCancellingPairs } from '@/modules/analytics/patterns'
import { waitlistDemand } from '@/modules/location/waitlist'

export const instant = false

export const metadata: Metadata = { title: 'Analytics' }

const count = new Intl.NumberFormat('en-IN')
const percent = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–'

/** Funnel, negotiation outcomes and supply by locality (§5 `/admin/analytics`, P1). */
export default async function AdminAnalyticsPage({
  searchParams,
}: PageProps<'/[lang]/admin/analytics'>) {
  await requirePageActor('ADMIN')
  const { days: raw } = await searchParams
  const days: AnalyticsRange = ANALYTICS_RANGES.find((d) => d === raw) ?? '30'
  const [a, waitlist, pairs] = await Promise.all([
    getAdminAnalytics({ days }),
    waitlistDemand(),
    repeatCancellingPairs({ days: Number(days) }),
  ])
  const [searches, requests, booked, completed] = a.funnel
  const finished = a.outcomes.filter((o) => o.key !== 'OPEN').reduce((n, o) => n + o.count, 0)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Analytics"
        description="Where customers drop off, how prices get agreed, and where more professionals are needed."
      />
      <LinkTabs
        label="Period"
        current={days}
        tabs={ANALYTICS_RANGES.map((d) => ({
          key: d,
          label: `Last ${d} days`,
          href: `/admin/analytics?days=${d}`,
        }))}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Searches" value={count.format(searches.count)} />
        <StatTile
          label="Searches that found nobody"
          value={count.format(a.emptySearches)}
          hint={`${percent(a.emptySearches, searches.count)} of searches`}
        />
        <StatTile
          label="Requests that became bookings"
          value={percent(booked.count, requests.count)}
        />
        <StatTile
          label="Quick match requests"
          value={count.format(a.quickMatches)}
          hint={`${percent(a.quickMatches, requests.count)} of requests`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <BarList
              title="From search to completed job"
              rows={a.funnel.map((step, i) => ({
                key: step.key,
                label: step.label,
                value: step.count,
                display: count.format(step.count),
                detail:
                  i === 0
                    ? 'Every search counts, repeats included'
                    : `${percent(step.count, a.funnel[i - 1].count)} of ${a.funnel[i - 1].label.toLowerCase()}`,
              }))}
            />
            <p className="text-xs text-ink-600">
              Requests are the bookings created in this period; {count.format(completed.count)} of
              them are completed so far.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <BarList
              title="How requests ended"
              rows={a.outcomes.map((o) => ({
                key: o.key,
                label: o.label,
                value: o.count,
                display: count.format(o.count),
                detail:
                  o.key === 'OPEN'
                    ? undefined
                    : `${percent(o.count, finished)} of finished requests`,
              }))}
            />
            {a.medianAgreedShare !== null && (
              <p className="text-xs text-ink-600">
                When the price was negotiated, the typical agreed price was{' '}
                {Math.round(a.medianAgreedShare * 100)}% of the listed price.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="supply-title" className="flex flex-col gap-3">
        <h2 id="supply-title" className="font-display text-xl font-semibold">
          Supply and demand by locality
        </h2>
        <p className="text-sm text-ink-600">
          Busiest localities first. Unfilled requests expired or were declined. Many of those with
          few professionals nearby means more are needed there.
        </p>
        {a.localities.length === 0 ? (
          <p className="text-ink-600">No professionals or requests yet.</p>
        ) : (
          <Table label="Supply and demand by locality">
            <THead>
              <tr>
                <TH>Locality</TH>
                <TH className="text-right">Verified professionals</TH>
                <TH className="text-right">Online now</TH>
                <TH className="text-right">Requests</TH>
                <TH className="text-right">Unfilled</TH>
              </tr>
            </THead>
            <tbody>
              {a.localities.map((l) => (
                <TR key={l.localityId}>
                  <TD>
                    {l.name}
                    <div className="text-xs text-ink-600">{l.city}</div>
                  </TD>
                  <TD className="text-right tabular-nums">{l.professionals}</TD>
                  <TD className="text-right tabular-nums">{l.onlineNow}</TD>
                  <TD className="text-right tabular-nums">{l.requests}</TD>
                  <TD className="text-right whitespace-nowrap tabular-nums">
                    {l.unfilled}
                    {l.requests > 0 && (
                      <span className="ml-1 text-xs text-ink-600">
                        ({percent(l.unfilled, l.requests)})
                      </span>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section aria-labelledby="pairs-title" className="flex flex-col gap-3">
        <h2 id="pairs-title" className="font-display text-xl font-semibold">
          Pairs who keep cancelling
        </h2>
        <p className="text-sm text-ink-600">
          The same customer and professional cancelling confirmed jobs with each other two or more
          times in this period. This can mean they are settling the work outside Kaamico.
        </p>
        {pairs.length === 0 ? (
          <p className="text-ink-600">No repeated cancellations in this period.</p>
        ) : (
          <Table label="Pairs who keep cancelling">
            <THead>
              <TR>
                <TH scope="col">Customer</TH>
                <TH scope="col">Professional</TH>
                <TH scope="col" className="text-right">
                  Cancelled
                </TH>
                <TH scope="col">By</TH>
                <TH scope="col">Bookings</TH>
              </TR>
            </THead>
            <tbody>
              {pairs.map((p) => (
                <TR key={`${p.customerId}:${p.workerId}`}>
                  <TD>{p.customerName ?? 'Unnamed customer'}</TD>
                  <TD>{p.workerName}</TD>
                  <TD className="text-right tabular-nums">{p.cancellations}</TD>
                  <TD>
                    customer {p.byCustomer} · professional {p.byWorker}
                  </TD>
                  <TD>
                    <ul className="flex flex-wrap gap-x-2">
                      {p.bookings.slice(0, 5).map((b) => (
                        <li key={b.id}>
                          <Link
                            href={`/admin/bookings/${b.id}`}
                            className="font-medium text-brand-700 underline"
                          >
                            {b.code}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section aria-labelledby="waitlist-title" className="flex flex-col gap-3">
        <h2 id="waitlist-title" className="font-display text-xl font-semibold">
          Cities people are waiting for
        </h2>
        <p className="text-sm text-ink-600">
          From the waitlist outside the service cities (all time). Each person counts once per city.
        </p>
        {waitlist.length === 0 ? (
          <p className="text-ink-600">Nobody has joined the waitlist yet.</p>
        ) : (
          <Card>
            <CardContent>
              <BarList
                title="Waitlist by city"
                rows={waitlist.map((w) => ({
                  key: w.city,
                  label: w.city,
                  value: w.people,
                  display: String(w.people),
                  detail: `Latest ${new Date(w.latest).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'Asia/Kolkata',
                  })}`,
                }))}
              />
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
