import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/** Data table that scrolls sideways inside its card on narrow screens, never the page. */
export function Table({ className, label, ...props }: ComponentProps<'table'> & { label: string }) {
  return (
    <div
      // `relative` makes this the containing block for sr-only text in cells; otherwise
      // that absolutely positioned text escapes the scroll area and widens the page.
      className="relative overflow-x-auto rounded-lg border border-border bg-surface"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
    </div>
  )
}

export function THead(props: ComponentProps<'thead'>) {
  return <thead className="bg-surface-muted text-xs text-ink-600 uppercase" {...props} />
}

export function TH({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn('px-3 py-2.5 font-medium tracking-wide whitespace-nowrap', className)}
      {...props}
    />
  )
}

export function TR({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-t border-border', className)} {...props} />
}

export function TD({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-3 py-2.5 align-top', className)} {...props} />
}
