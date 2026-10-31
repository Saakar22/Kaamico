import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function PageHeader({
  title,
  description,
  actions,
  leading,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Shown before the title, e.g. a category thumbnail. */
  leading?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="flex items-center gap-4">
        {leading}
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl leading-tight font-semibold sm:text-4xl">{title}</h1>
          {description && <p className="max-w-prose text-ink-600">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
