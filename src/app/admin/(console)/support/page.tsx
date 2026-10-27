import { LifeBuoy } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { TicketStatusBadge } from '@/components/domain/support/ticket-views'
import { LinkTabs } from '@/components/patterns/link-tabs'
import { PageHeader } from '@/components/patterns/page-header'
import { Pager } from '@/components/patterns/pager'
import { EmptyState } from '@/components/patterns/states'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIstDateTime } from '@/lib/time'
import { requirePageActor } from '@/modules/auth/page-guards'
import { TICKET_CATEGORY_LABELS } from '@/modules/support/labels'
import { adminTicketQuery, listAdminTickets } from '@/modules/support/support'

export const instant = false

export const metadata: Metadata = { title: 'Support' }

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
const TABS = [
  { key: 'ACTIVE', label: 'Active' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'ALL', label: 'All' },
] as const

export default async function AdminSupportPage({ searchParams }: PageProps<'/admin/support'>) {
  await requirePageActor('ADMIN')
  const raw = await searchParams
  const parsed = adminTicketQuery.safeParse({ status: one(raw.status), page: one(raw.page) })
  const query = parsed.success ? parsed.data : adminTicketQuery.parse({})
  const result = await listAdminTickets(query)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Support"
        description="Help requests from customers and professionals. Active ones are those waiting longest first."
      />
      <LinkTabs
        label="Request status"
        current={query.status}
        tabs={TABS.map((t) => ({ ...t, href: `/admin/support?status=${t.key}` }))}
      />
      {result.items.length === 0 ? (
        <Card>
          <EmptyState icon={LifeBuoy} title="No requests here" />
        </Card>
      ) : (
        <Table label="Help requests">
          <THead>
            <tr>
              <TH>Subject</TH>
              <TH>From</TH>
              <TH>Topic</TH>
              <TH>Status</TH>
              <TH>Last message</TH>
            </tr>
          </THead>
          <tbody>
            {result.items.map((t) => (
              <TR key={t.id}>
                <TD>
                  <Link
                    href={`/admin/support/${t.id}`}
                    className="font-medium text-brand-700 underline"
                  >
                    {t.subject}
                  </Link>
                  {t.bookingCode && <div className="text-xs text-ink-600">{t.bookingCode}</div>}
                </TD>
                <TD>{t.ownerName ?? '–'}</TD>
                <TD>{TICKET_CATEGORY_LABELS[t.category]}</TD>
                <TD>
                  <span className="flex flex-wrap gap-1">
                    <TicketStatusBadge status={t.status} />
                    {!t.awaitingOwner && t.status !== 'CLOSED' && (
                      <Badge tone="brand">Needs reply</Badge>
                    )}
                  </span>
                </TD>
                <TD className="whitespace-nowrap">
                  {formatIstDateTime(new Date(t.lastMessageAt))}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <Pager
        path="/admin/support"
        params={{ status: query.status }}
        page={result.page}
        hasMore={result.hasMore}
      />
    </div>
  )
}
