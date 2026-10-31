import { MessageSquareWarning } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ReasonActionDialog } from '@/components/domain/admin/reason-action-dialog'
import { RatingStars } from '@/components/domain/professionals/rating'
import { LinkTabs } from '@/components/patterns/link-tabs'
import { PageHeader } from '@/components/patterns/page-header'
import { Pager } from '@/components/patterns/pager'
import { EmptyState } from '@/components/patterns/states'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIstDateTime } from '@/lib/time'
import { requirePageActor } from '@/modules/auth/page-guards'
import { adminReviewQuery, listAdminReviews } from '@/modules/reviews/moderation'

export const instant = false

export const metadata: Metadata = { title: 'Reviews' }

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
const TABS = [
  { key: 'FLAGGED', label: 'Reported' },
  { key: 'HIDDEN', label: 'Hidden' },
  { key: 'PUBLISHED', label: 'Published' },
  { key: 'ALL', label: 'All' },
] as const
const STATUS: Record<string, { label: string; tone: 'warning' | 'neutral' | 'success' }> = {
  FLAGGED: { label: 'reported', tone: 'warning' },
  HIDDEN: { label: 'hidden', tone: 'neutral' },
  PUBLISHED: { label: 'published', tone: 'success' },
}

export default async function AdminReviewsPage({
  searchParams,
}: PageProps<'/[lang]/admin/reviews'>) {
  await requirePageActor('ADMIN')
  const raw = await searchParams
  const parsed = adminReviewQuery.safeParse({ status: one(raw.status), page: one(raw.page) })
  const query = parsed.success ? parsed.data : adminReviewQuery.parse({})
  const result = await listAdminReviews(query)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Reviews"
        description="Reported reviews stay public until you decide. Hiding removes a review from the profile and the rating; the professional sees your reason."
      />
      <LinkTabs
        label="Review status"
        current={query.status}
        tabs={TABS.map((t) => ({ ...t, href: `/admin/reviews?status=${t.key}` }))}
      />
      {result.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquareWarning}
            title={query.status === 'FLAGGED' ? 'No reported reviews' : 'No reviews here'}
            description={
              query.status === 'FLAGGED'
                ? 'Reports from professionals and customers appear here.'
                : undefined
            }
          />
        </Card>
      ) : (
        <Table label="Reviews">
          <THead>
            <tr>
              <TH>Review</TH>
              <TH>Professional</TH>
              <TH>Report</TH>
              <TH>Status</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <tbody>
            {result.items.map((r) => (
              <TR key={r.id}>
                <TD className="min-w-64">
                  <RatingStars rating={r.rating} />
                  {r.comment && <p className="mt-1">{r.comment}</p>}
                  <p className="mt-1 text-xs text-ink-600">
                    {r.customerName ?? 'Customer'} ·{' '}
                    <Link
                      href={`/admin/bookings/${r.booking.id}`}
                      className="text-brand-700 underline"
                    >
                      {r.booking.code}
                    </Link>{' '}
                    · {formatIstDateTime(new Date(r.createdAt))}
                  </p>
                  {r.reply && (
                    <p className="mt-1 text-xs">
                      <span className="font-medium">Reply:</span> {r.reply}
                    </p>
                  )}
                </TD>
                <TD>{r.worker.name}</TD>
                <TD className="min-w-48">
                  {r.flagReason ? (
                    <>
                      <p>{r.flagReason}</p>
                      <p className="text-xs text-ink-600">
                        By the {r.flaggedBy === 'CUSTOMER' ? 'customer' : 'professional'}
                        {r.flaggedAt && ` · ${formatIstDateTime(new Date(r.flaggedAt))}`}
                      </p>
                    </>
                  ) : (
                    '–'
                  )}
                </TD>
                <TD>
                  <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                  {r.hiddenReason && <p className="mt-1 text-xs text-ink-600">{r.hiddenReason}</p>}
                </TD>
                <TD>
                  <div className="flex flex-col gap-2">
                    {r.status !== 'HIDDEN' && (
                      <ReasonActionDialog
                        label="Hide"
                        size="sm"
                        title="Hide this review?"
                        description="It disappears from the public profile and no longer counts in the rating. The professional sees your reason."
                        endpoint={`/api/v1/admin/reviews/${r.id}`}
                        method="PATCH"
                        body={{ action: 'HIDE' }}
                        reasonHint="At least 10 characters. Shown to the professional and recorded in the audit log."
                        success="Review hidden"
                      />
                    )}
                    {r.status !== 'PUBLISHED' && (
                      <ReasonActionDialog
                        label={r.status === 'FLAGGED' ? 'Keep' : 'Restore'}
                        size="sm"
                        variant="secondary"
                        title={
                          r.status === 'FLAGGED' ? 'Keep this review?' : 'Restore this review?'
                        }
                        description={
                          r.status === 'FLAGGED'
                            ? 'The report is dismissed and the review stays public.'
                            : 'It returns to the public profile and counts in the rating again.'
                        }
                        endpoint={`/api/v1/admin/reviews/${r.id}`}
                        method="PATCH"
                        body={{ action: 'RESTORE' }}
                        success={r.status === 'FLAGGED' ? 'Report dismissed' : 'Review restored'}
                      />
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <Pager
        path="/admin/reviews"
        params={{ status: query.status }}
        page={result.page}
        hasMore={result.hasMore}
      />
    </div>
  )
}
