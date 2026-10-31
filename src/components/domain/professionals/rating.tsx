import { Star } from 'lucide-react'
import { getT } from '@/i18n/server'
import { cn } from '@/lib/cn'

/** "★ 4.7 (128)", or "No reviews yet". The full sentence is what screen readers hear. */
export async function RatingSummary({
  avg,
  count,
  className,
}: {
  avg: number | null
  count: number
  className?: string
}) {
  const t = await getT()
  if (avg === null || count === 0) {
    return <span className={cn('text-sm text-ink-600', className)}>{t('rating.noReviews')}</span>
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm', className)}>
      <Star aria-hidden="true" className="size-4 fill-accent-500 text-accent-500" />
      <span aria-hidden="true">
        <span className="font-semibold tabular-nums">{avg.toFixed(1)}</span>{' '}
        <span className="text-ink-600 tabular-nums">({count})</span>
      </span>
      <span className="sr-only">
        {t(count === 1 ? 'rating.ratedOne' : 'rating.ratedOther', {
          avg: avg.toFixed(1),
          count,
        })}
      </span>
    </span>
  )
}

/** Five stars, filled to the nearest whole star. */
export async function RatingStars({ rating, className }: { rating: number; className?: string }) {
  const t = await getT()
  const filled = Math.round(rating)
  return (
    <span
      className={cn('inline-flex gap-0.5', className)}
      role="img"
      aria-label={t('rating.starsLabel', { rating })}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={cn(
            'size-4',
            i <= filled ? 'fill-accent-500 text-accent-500' : 'fill-none text-border',
          )}
        />
      ))}
    </span>
  )
}
