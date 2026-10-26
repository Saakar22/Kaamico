import { ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { LinkTabs } from '@/components/patterns/link-tabs'
import { PageHeader } from '@/components/patterns/page-header'
import { Pager } from '@/components/patterns/pager'
import { EmptyState } from '@/components/patterns/states'
import { Card } from '@/components/ui/card'
import { Table, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIstDateTime } from '@/lib/time'
import {
  countPendingVerifications,
  listVerificationQueue,
  QUEUE_TABS,
  type QueueTab,
} from '@/modules/admin/verifications'
import { requirePageActor } from '@/modules/auth/page-guards'

export const instant = false

export const metadata: Metadata = { title: 'Verifications' }

const LABELS: Record<QueueTab, string> = {
  pending: 'To review',
  resubmission: 'Waiting on professional',
  approved: 'Approved',
  rejected: 'Rejected',
}

export default async function VerificationQueuePage({
  searchParams,
}: PageProps<'/admin/verifications'>) {
  await requirePageActor('ADMIN')
  const { tab: rawTab, page: rawPage } = await searchParams
  const tab = QUEUE_TABS.find((t) => t === rawTab) ?? 'pending'
  const page = Math.max(1, Number(rawPage) || 1)
  const [queue, pending] = await Promise.all([
    listVerificationQueue(tab, page),
    countPendingVerifications(),
  ])
  const decided = tab === 'approved' || tab === 'rejected'

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Verifications"
        description="Oldest first. Every document you open is recorded in the audit log."
      />
      <LinkTabs
        label="Application status"
        current={tab}
        tabs={QUEUE_TABS.map((t) => ({
          key: t,
          label: LABELS[t],
          href: `/admin/verifications?tab=${t}`,
          count: t === 'pending' ? pending : undefined,
        }))}
      />
      {queue.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title="Nothing here"
            description="No applications in this list."
          />
        </Card>
      ) : (
        <Table label={`${LABELS[tab]} applications`}>
          <THead>
            <tr>
              <TH>Professional</TH>
              <TH>Skills</TH>
              <TH>City</TH>
              <TH>Attempt</TH>
              <TH>Documents</TH>
              <TH>{decided ? 'Decided' : 'Submitted'}</TH>
            </tr>
          </THead>
          <tbody>
            {queue.items.map((a) => (
              <TR key={a.id}>
                <TD>
                  <Link
                    href={`/admin/verifications/${a.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {a.workerName}
                  </Link>
                  <div className="text-xs text-ink-600">{a.phone}</div>
                </TD>
                <TD>{a.skills.join(', ') || '–'}</TD>
                <TD>{a.city ?? '–'}</TD>
                <TD>{a.attempt}</TD>
                <TD>{a.documentCount}</TD>
                <TD className="whitespace-nowrap">
                  {(() => {
                    const at = decided ? a.reviewedAt : a.submittedAt
                    return at ? formatIstDateTime(new Date(at)) : '–'
                  })()}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <Pager
        path="/admin/verifications"
        params={{ tab }}
        page={queue.page}
        hasMore={queue.hasMore}
      />
    </div>
  )
}
