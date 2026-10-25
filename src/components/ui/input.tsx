import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

// 16px text on all controls prevents iOS from zooming on focus.
export const controlClasses =
  'w-full rounded-md border border-border bg-surface px-3 text-base text-ink-900 placeholder:text-ink-600/70 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70 aria-invalid:border-danger-700'

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn(controlClasses, 'h-11', className)} {...props} />
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(controlClasses, 'py-2.5', className)} {...props} />
}

/** Native select: best keyboard, screen-reader and mobile picker support. */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(controlClasses, 'h-11 pr-8', className)} {...props}>
      {children}
    </select>
  )
}

export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      className={cn('size-6 shrink-0 rounded-sm accent-brand-600', className)}
      {...props}
    />
  )
}
