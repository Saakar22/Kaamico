import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/** Placeholder block shaped like the content it stands in for. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-border/70 motion-reduce:animate-none', className)}
      {...props}
    />
  )
}
