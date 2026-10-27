import { Star } from 'lucide-react'
import type { Metadata } from 'next'
import { ReasonActionDialog } from '@/components/domain/admin/reason-action-dialog'
import { RatingStars } from '@/components/domain/professionals/rating'
import { ReplyForm } from '@/components/domain/reviews/reply-form'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatIstDateTime } from '@/lib/time'
import { listWorkerReviews } from '@/modules/reviews/moderation'
import { reviewTagLabel } from '@/modules/reviews/tags'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export const metadata: Metadata = { title: 'Your reviews' }

export default async function WorkerReviewsPage() {
  const actor = await requireWorkerPage()
  const reviews = await listWorkerReviews(actor)

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="Your reviews"
        description="Reply to thank customers or explain what happened. If a review is unfair or about a different job, report it and Kaamico will check it."
      />
      {reviews.length === 0 ? (
        <Card>
          <EmptyState
            icon={Star}
            title="No reviews yet"
            description="Customers can rate you after a completed job."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {reviews.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <RatingStars rating={r.rating} />
                    <span className="font-medium">{r.author}</span>
                    <span className="text-sm text-ink-600">
                      {r.serviceName} · {r.bookingCode} · {formatIstDateTime(new Date(r.createdAt))}
                    </span>
                    {r.status === 'FLAGGED' && (
                      <Badge tone="warning">Reported: being checked</Badge>
                    )}
                    {r.status === 'HIDDEN' && <Badge tone="neutral">Hidden by Kaamico</Badge>}
                  </div>
                  {r.comment && <p>{r.comment}</p>}
                  {r.tags.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
                      {r.tags.map((t) => (
                        <li key={t}>
                          <Badge>{reviewTagLabel(t)}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.status === 'HIDDEN' && r.hiddenReason && (
                    <p className="text-sm text-ink-600">
                      Not shown on your profile or counted in your rating: {r.hiddenReason}
                    </p>
                  )}
                  {r.reply ? (
                    <p className="rounded-md bg-surface-muted px-3 py-2 text-sm">
                      <span className="font-medium">Your reply: </span>
                      {r.reply}
                    </p>
                  ) : (
                    r.status !== 'HIDDEN' && <ReplyForm reviewId={r.id} author={r.author} />
                  )}
                  {r.status === 'PUBLISHED' && (
                    <div>
                      <ReasonActionDialog
                        label="Report this review"
                        size="sm"
                        variant="tertiary"
                        title="Report this review?"
                        description="It stays on your profile while Kaamico checks it. We hide reviews that are about a different job, abusive, or share private details."
                        endpoint={`/api/v1/reviews/${r.id}/report`}
                        body={{}}
                        reasonLabel="What is wrong with it?"
                        reasonHint="At least 10 characters. Only Kaamico sees this."
                        success="Thanks. We will check this review."
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
