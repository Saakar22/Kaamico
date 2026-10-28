import { cn } from '@/lib/cn'

export type BarRow = {
  key: string
  label: string
  value: number
  /** Formatted value at the bar's tip, e.g. "₹4,500" or "128". */
  display: string
  /** Secondary text under the label, e.g. "42% of searches". */
  detail?: string
}

/**
 * Horizontal bars, one series, every value labelled at its tip (dataviz: ≤ 24 px bars
 * with a 4 px rounded end on one baseline, text in ink, never in the bar colour). Bars
 * are drawn against the largest value, so the list reads as a ranking or a funnel.
 */
export function BarList({
  title,
  rows,
  className,
}: {
  title: string
  rows: BarRow[]
  className?: string
}) {
  const max = Math.max(0, ...rows.map((r) => r.value))
  return (
    <figure className={cn('flex flex-col gap-3', className)}>
      <figcaption className="text-sm font-semibold text-ink-900">{title}</figcaption>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.key} className="grid gap-1 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-3">
            <span className="flex flex-col text-sm">
              <span className="text-ink-900">{r.label}</span>
              {r.detail && <span className="text-xs text-ink-600">{r.detail}</span>}
            </span>
            <span className="flex items-center gap-2">
              <span className="flex h-3 flex-1 items-center" aria-hidden>
                <span
                  className="h-full rounded-r-[4px] bg-brand-600"
                  style={{
                    width: max > 0 && r.value > 0 ? `${Math.max((r.value / max) * 100, 1)}%` : 0,
                  }}
                />
              </span>
              <span className="w-20 shrink-0 text-right text-sm font-semibold text-ink-900 tabular-nums">
                {r.display}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
