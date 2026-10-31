import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Kaamico's signature pattern: a printed rate list. Each row sets a service (or category)
 * against its price with a dotted leader, so prices line up and can be compared at a
 * glance. Rows are separated by hairlines rather than boxed as cards.
 */
export function RateList({
  className,
  children,
  label,
}: {
  className?: string
  children: ReactNode
  /** Accessible name when the list has no visible heading of its own. */
  label?: string
}) {
  return (
    <ul aria-label={label} className={cn('flex flex-col border-t border-border', className)}>
      {children}
    </ul>
  )
}

export function RateRow({
  label,
  detail,
  price,
  priceNote,
  leading,
  href,
  className,
}: {
  label: ReactNode
  /** Secondary line under the label: description, duration, category. */
  detail?: ReactNode
  /** The figure on the right, e.g. <Money/>. Omit for rows without a price. */
  price?: ReactNode
  /** Small text under the price: unit, "Open to offers", "minimum ₹120". */
  priceNote?: ReactNode
  /** An icon before the label. */
  leading?: ReactNode
  /** Makes the whole row a link. */
  href?: string
  className?: string
}) {
  const body = (
    <>
      {leading && <span className="mt-0.5 shrink-0 self-start">{leading}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 font-medium text-ink-900">{label}</span>
          {price !== undefined && <span aria-hidden="true" className="leader" />}
          {price !== undefined && (
            <span className="shrink-0 font-display text-lg leading-none font-semibold whitespace-nowrap text-ink-900 tabular-nums">
              {price}
            </span>
          )}
        </span>
        {(detail || priceNote) && (
          <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm text-ink-600">
            {detail && <span className="min-w-0">{detail}</span>}
            {priceNote && <span className="ml-auto text-right">{priceNote}</span>}
          </span>
        )}
      </span>
      {href && (
        <ChevronRight
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 self-start text-ink-600 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      )}
    </>
  )
  return (
    <li className={cn('border-b border-border', className)}>
      {href ? (
        <Link
          href={href}
          className="group -mx-2 flex min-h-14 items-center gap-3 rounded-sm px-2 py-3 transition-colors hover:bg-surface-muted motion-reduce:transition-none"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-h-14 items-center gap-3 py-3">{body}</div>
      )}
    </li>
  )
}
