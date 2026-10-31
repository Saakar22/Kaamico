import { Star } from 'lucide-react'
import type { Metadata } from 'next'
import { ReasonActionDialog } from '@/components/domain/admin/reason-action-dialog'
import { RatingStars } from '@/components/domain/professionals/rating'
import { ReplyForm } from '@/components/domain/reviews/reply-form'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { htmlLang } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import { formatIstDateTime } from '@/lib/time'
import { listWorkerReviews } from '@/modules/reviews/moderation'
import { reviewTagLabel } from '@/modules/reviews/tags'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('wreviews.metaTitle') }
}

export default async function WorkerReviewsPage() {
  const actor = await requireWorkerPage()
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const reviews = await listWorkerReviews(actor, 50, locale)

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title={t('wreviews.title')} description={t('wreviews.description')} />
      {reviews.length === 0 ? (
        <Card>
          <EmptyState icon={Star} title={t('wreviews.none')} description={t('wreviews.noneBody')} />
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
                      {r.serviceName} · {r.bookingCode} ·{' '}
                      {formatIstDateTime(new Date(r.createdAt), htmlLang[locale])}
                    </span>
                    {r.status === 'FLAGGED' && (
                      <Badge tone="warning">{t('wreviews.reported')}</Badge>
                    )}
                    {r.status === 'HIDDEN' && <Badge tone="neutral">{t('wreviews.hidden')}</Badge>}
                  </div>
                  {r.comment && <p>{r.comment}</p>}
                  {r.tags.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5" aria-label={t('wreviews.tags')}>
                      {r.tags.map((tag) => (
                        <li key={tag}>
                          <Badge>{reviewTagLabel(tag, locale)}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.status === 'HIDDEN' && r.hiddenReason && (
                    <p className="text-sm text-ink-600">
                      {t('wreviews.hiddenNote', { reason: r.hiddenReason })}
                    </p>
                  )}
                  {r.reply ? (
                    <p className="rounded-md bg-surface-muted px-3 py-2 text-sm">
                      <span className="font-medium">{t('wreviews.yourReply')}</span>
                      {r.reply}
                    </p>
                  ) : (
                    r.status !== 'HIDDEN' && <ReplyForm reviewId={r.id} author={r.author} />
                  )}
                  {r.status === 'PUBLISHED' && (
                    <div>
                      <ReasonActionDialog
                        label={t('wreviews.report')}
                        size="sm"
                        variant="tertiary"
                        title={t('wreviews.reportTitle')}
                        description={t('wreviews.reportBody')}
                        endpoint={`/api/v1/reviews/${r.id}/report`}
                        body={{}}
                        reasonLabel={t('wreviews.reportReason')}
                        reasonHint={t('wreviews.reportHint')}
                        success={t('wreviews.reportDone')}
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
