import { Star } from 'lucide-react'
import { cn } from '@/lib/cn'

/** "★ 4.7 (128)", or "No reviews yet". The full sentence is what screen readers hear. */
export function RatingSummary({
  avg,
  count,
  className,
}: {
  avg: number | null
  count: number
  className?: string
}) {
  if (avg === null || count === 0) {
    return <span className={cn('text-sm text-ink-600', className)}>No reviews yet</span>
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm', className)}>
      <Star aria-hidden="true" className="size-4 fill-accent-500 text-accent-500" />
      <span aria-hidden="true">
        <span className="font-semibold tabular-nums">{avg.toFixed(1)}</span>{' '}
        <span className="text-ink-600 tabular-nums">({count})</span>
      </span>
      <span className="sr-only">
        Rated {avg.toFixed(1)} out of 5 from {count} {count === 1 ? 'review' : 'reviews'}
      </span>
    </span>
  )
}

/** Five stars, filled to the nearest whole star. */
export function RatingStars({ rating, className }: { rating: number; className?: string }) {
  const filled = Math.round(rating)
  return (
    <span
      className={cn('inline-flex gap-0.5', className)}
      role="img"
      aria-label={`${rating} out of 5 stars`}
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
