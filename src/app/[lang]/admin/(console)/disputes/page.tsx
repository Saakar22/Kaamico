import { ShieldAlert } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { LinkTabs } from '@/components/patterns/link-tabs'
import { PageHeader } from '@/components/patterns/page-header'
import { Pager } from '@/components/patterns/pager'
import { EmptyState } from '@/components/patterns/states'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIstDateTime } from '@/lib/time'
import { requirePageActor } from '@/modules/auth/page-guards'
import { adminDisputeQuery, listAdminDisputes } from '@/modules/disputes/disputes'
import { DISPUTE_OUTCOME_LABELS, DISPUTE_REASON_LABELS } from '@/modules/disputes/labels'

export const instant = false

export const metadata: Metadata = { title: 'Reported problems' }

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
const TABS = [
  { key: 'OPEN', label: 'Open' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'ALL', label: 'All' },
] as const

export default async function AdminDisputesPage({
  searchParams,
}: PageProps<'/[lang]/admin/disputes'>) {
  await requirePageActor('ADMIN')
  const raw = await searchParams
  const parsed = adminDisputeQuery.safeParse({ status: one(raw.status), page: one(raw.page) })
  const query = parsed.success ? parsed.data : adminDisputeQuery.parse({})
  const result = await listAdminDisputes(query)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Reported problems"
        description="Problems customers and professionals report on a job. Open ones are oldest first. The booking is on hold until you decide."
      />
      <LinkTabs
        label="Report status"
        current={query.status}
        tabs={TABS.map((t) => ({ ...t, href: `/admin/disputes?status=${t.key}` }))}
      />
      {result.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title={query.status === 'OPEN' ? 'No open reports' : 'No reports here'}
          />
        </Card>
      ) : (
        <Table label="Reported problems">
          <THead>
            <tr>
              <TH>Booking</TH>
              <TH>Problem</TH>
              <TH>Reported by</TH>
              <TH>Status</TH>
              <TH>Reported</TH>
            </tr>
          </THead>
          <tbody>
            {result.items.map((d) => (
              <TR key={d.id}>
                <TD>
                  <Link
                    href={`/admin/disputes/${d.id}`}
                    className="font-medium text-brand-700 underline"
                  >
                    {d.booking.code}
                  </Link>
                  <div className="text-xs text-ink-600">{d.booking.serviceName}</div>
                </TD>
                <TD>{DISPUTE_REASON_LABELS[d.reason]}</TD>
                <TD>
                  {d.raisedBy === 'CUSTOMER'
                    ? `Customer (${d.customerName ?? '–'})`
                    : `Professional (${d.workerName ?? '–'})`}
                </TD>
                <TD>
                  {d.outcome ? (
                    <Badge tone="neutral">{DISPUTE_OUTCOME_LABELS[d.outcome]}</Badge>
                  ) : (
                    <Badge tone="warning">open</Badge>
                  )}
                </TD>
                <TD className="whitespace-nowrap">{formatIstDateTime(new Date(d.createdAt))}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <Pager
        path="/admin/disputes"
        params={{ status: query.status }}
        page={result.page}
        hasMore={result.hasMore}
      />
    </div>
  )
}
