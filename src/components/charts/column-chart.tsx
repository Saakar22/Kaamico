'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import { compactValue, niceTicks, type ChartUnit } from './scale'

export type Column = {
  key: string
  /** Axis label under the column, e.g. "12 Oct". */
  tick: string
  /** Longer name for the tooltip and table, e.g. "Week of 12 Oct". */
  name: string
  value: number
  /** Formatted value, e.g. "₹4,500". */
  display: string
  /** Secondary line in the tooltip and table, e.g. "3 jobs". */
  detail?: string
}

/**
 * One series over time as columns (dataviz: ≤ 24 px columns, 4 px rounded caps on a
 * single baseline, hairline grid, only the latest value labelled). Each column shows a
 * tooltip on hover and keyboard focus, and the same numbers are in "Show as table".
 */
export function ColumnChart({
  title,
  columns,
  unit,
  valueHeader,
  detailHeader,
  height = 160,
}: {
  title: string
  columns: Column[]
  unit: ChartUnit
  valueHeader: string
  detailHeader?: string
  height?: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(0, ...columns.map((c) => c.value))
  const ticks = niceTicks(max)
  const top = ticks.at(-1) || 1
  const last = columns.length - 1

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-sm font-semibold text-ink-900">{title}</figcaption>
      <div className="flex gap-2">
        {/* Y axis: clean, compact ticks. */}
        <div
          aria-hidden
          className="relative w-10 shrink-0 text-right text-xs text-ink-600 tabular-nums"
          style={{ height }}
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${100 - (t / top) * 100}%` }}
            >
              {compactValue(t, unit)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }} onPointerLeave={() => setActive(null)}>
            {ticks.map((t) => (
              <div
                key={t}
                aria-hidden
                className="absolute inset-x-0 border-t border-border"
                style={{ top: `${100 - (t / top) * 100}%` }}
              />
            ))}
            <div role="group" aria-label={title} className="absolute inset-0 flex">
              {columns.map((c, i) => {
                const pct = c.value > 0 ? Math.max((c.value / top) * 100, 1) : 0
                return (
                  <div
                    key={c.key}
                    role="img"
                    tabIndex={0}
                    aria-label={`${c.name}: ${c.display}${c.detail ? `, ${c.detail}` : ''}`}
                    className="relative flex flex-1 items-end justify-center outline-none focus-visible:bg-brand-50"
                    onPointerEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  >
                    <div
                      className={cn(
                        'w-[60%] max-w-6 rounded-t-[4px] transition-colors',
                        active === i ? 'bg-brand-700' : 'bg-brand-600',
                      )}
                      style={{ height: `${pct}%` }}
                    />
                    {i === last && active === null && c.value > 0 && (
                      <span
                        aria-hidden
                        className="absolute right-0 -translate-y-full pb-1 text-xs font-semibold whitespace-nowrap text-ink-900"
                        style={{ bottom: `${pct}%` }}
                      >
                        {c.display}
                      </span>
                    )}
                    {active === i && (
                      <div
                        aria-hidden
                        className={cn(
                          'pointer-events-none absolute z-10 flex flex-col rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md',
                          i < columns.length / 2 ? 'left-0' : 'right-0',
                        )}
                        style={{ bottom: `calc(${pct}% + 6px)` }}
                      >
                        <span className="text-sm font-semibold text-ink-900">{c.display}</span>
                        <span className="text-ink-600">{c.name}</span>
                        {c.detail && <span className="text-ink-600">{c.detail}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div aria-hidden className="mt-1.5 flex text-xs text-ink-600">
            {/* On phones every other label is hidden (keeping its space) so none collide. */}
            {columns.map((c, i) => (
              <span
                key={c.key}
                className={cn(
                  'flex w-0 flex-1 justify-center whitespace-nowrap',
                  (last - i) % 2 === 1 && 'invisible sm:visible',
                )}
              >
                {c.tick}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-brand-700 hover:underline">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead className="text-ink-600">
            <tr>
              <th scope="col" className="py-1 font-medium">
                Period
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {valueHeader}
              </th>
              {detailHeader && (
                <th scope="col" className="py-1 text-right font-medium">
                  {detailHeader}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.key} className="border-t border-border">
                <th scope="row" className="py-1 font-normal">
                  {c.name}
                </th>
                <td className="py-1 text-right tabular-nums">{c.display}</td>
                {detailHeader && <td className="py-1 text-right tabular-nums">{c.detail}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
