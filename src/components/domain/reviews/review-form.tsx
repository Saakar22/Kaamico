'use client'

import { Star } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Textarea } from '@/components/ui/input'
import { useLocale, useT } from '@/i18n/client'
import type { MessageKey } from '@/i18n/translate'
import { apiFetch } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { reviewTagLabel, REVIEW_TAGS, type ReviewTag } from '@/modules/reviews/tags'

const MEANING: MessageKey[] = [
  'review.poor',
  'review.poor',
  'review.below',
  'review.okay',
  'review.good',
  'review.excellent',
]

/** Stars with large tap targets, optional compliments and a comment (§4 step 12). */
export function ReviewForm({ bookingId, workerName }: { bookingId: string; workerName: string }) {
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const { pending, error, run } = useApiAction()
  const [rating, setRating] = useState(0)
  const [tags, setTags] = useState<ReviewTag[]>([])
  const [comment, setComment] = useState('')
  const [key] = useState(() => crypto.randomUUID())

  const toggle = (tag: ReviewTag) =>
    setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!rating) return
    return run(
      async () => {
        await apiFetch(`/api/v1/bookings/${bookingId}/review`, {
          body: { rating, tags, comment: comment || undefined },
          idempotencyKey: key,
        })
        router.push(`/bookings/${bookingId}`)
      },
      { success: t('review.thanks'), refresh: false },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">{t('review.how', { name: workerName })}</legend>
        <div className="flex gap-1" role="radiogroup" aria-label={t('review.rating')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={t(n === 1 ? 'review.starOne' : 'review.starOther', {
                count: n,
                meaning: t(MEANING[n]),
              })}
              onClick={() => setRating(n)}
              className="flex size-12 items-center justify-center rounded-md hover:bg-surface-muted"
            >
              <Star
                aria-hidden="true"
                className={cn(
                  'size-8',
                  n <= rating ? 'fill-accent-500 text-accent-500' : 'text-ink-600',
                )}
              />
            </button>
          ))}
        </div>
        <p className="h-5 text-sm text-ink-600" aria-live="polite">
          {rating > 0 && t(MEANING[rating])}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">{t('review.wentWell')}</legend>
        <div className="flex flex-wrap gap-2">
          {REVIEW_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={tags.includes(tag)}
              onClick={() => toggle(tag)}
              className={cn(
                'inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium',
                tags.includes(tag)
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-border text-ink-900 hover:border-brand-600',
              )}
            >
              {reviewTagLabel(tag, locale)}
            </button>
          ))}
        </div>
      </fieldset>

      <FormField label={t('review.anythingElse')} hint={t('review.shownOn')}>
        {(field) => (
          <Textarea
            {...field}
            rows={4}
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        )}
      </FormField>
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        className="self-start"
        disabled={!rating}
        loading={pending}
        loadingText={t('review.sending')}
      >
        {t('review.post')}
      </Button>
    </form>
  )
}
