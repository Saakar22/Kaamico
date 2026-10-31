import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** One number with its label, for dashboards: a ledger figure under a rule, not a box. */
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
    <div className={cn('flex flex-col gap-1 border-t-2 border-ink-900 pt-3', className)}>
      <span className="text-sm text-ink-600">{label}</span>
      <span className="font-display text-3xl leading-tight font-semibold tabular-nums">
        {value}
      </span>
      {hint && <span className="text-xs text-ink-600">{hint}</span>}
    </div>
  )
}
