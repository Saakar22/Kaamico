'use client'

import { Star } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Textarea } from '@/components/ui/input'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'
import { cn } from '@/lib/cn'

/** Tag ids and labels, passed from the server (the module holding them is server-only). */
type TagOption = { id: string; label: string }

/**
 * After a job, the professional privately rates the customer. Nobody sees an individual
 * rating; other professionals see an average once enough have rated.
 */
export function CustomerRatingForm({
  bookingId,
  customerName,
  tags: tagOptions,
}: {
  bookingId: string
  customerName: string
  tags: TagOption[]
}) {
  const t = useT()
  const { pending, error, run } = useApiAction()
  const [rating, setRating] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [key] = useState(() => crypto.randomUUID())

  const toggle = (tag: string) =>
    setTags((list) => (list.includes(tag) ? list.filter((x) => x !== tag) : [...list, tag]))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!rating) return
    return run(
      () =>
        apiFetch(`/api/v1/bookings/${bookingId}/customer-rating`, {
          body: { rating, tags, note: note || undefined },
          idempotencyKey: key,
        }),
      { success: t('rateCustomer.saved') },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">{t('rateCustomer.title', { name: customerName })}</h2>
        <p className="text-sm text-ink-600">{t('rateCustomer.privacy', { name: customerName })}</p>
      </div>
      <div className="flex gap-1" role="radiogroup" aria-label={t('rateCustomer.rating')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={t(n === 1 ? 'rateCustomer.starOne' : 'rateCustomer.starOther', {
              count: n,
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
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t('rateCustomer.tags')}</legend>
        <div className="flex flex-wrap gap-2">
          {tagOptions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              aria-pressed={tags.includes(tag.id)}
              onClick={() => toggle(tag.id)}
              className={cn(
                'inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium',
                tags.includes(tag.id)
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-border text-ink-900 hover:border-brand-600',
              )}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </fieldset>
      <FormField label={t('rateCustomer.note')} hint={t('rateCustomer.noteHint')}>
        {(field) => (
          <Textarea
            {...field}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
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
        className="self-start"
        disabled={!rating}
        loading={pending}
        loadingText={t('rateCustomer.sending')}
      >
        {t('rateCustomer.submit')}
      </Button>
    </form>
  )
}
