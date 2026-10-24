import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** One number with its label, for dashboards. */
export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border border-border bg-surface p-4',
        className,
      )}
    >
      <span className="text-sm text-ink-600">{label}</span>
      <span className="font-display text-2xl font-bold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-ink-600">{hint}</span>}
    </div>
  )
}
