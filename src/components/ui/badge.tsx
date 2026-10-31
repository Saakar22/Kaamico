import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export const badgeVariants = cva(
  // Squared tags, like a stamp on a job card, rather than pills.
  'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs leading-4 font-semibold whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface-muted text-ink-600',
        brand: 'border-brand-600/20 bg-brand-50 text-brand-700',
        success: 'border-success-700/20 bg-success-700/10 text-success-800',
        warning: 'border-warning-700/20 bg-warning-700/10 text-warning-800',
        danger: 'border-danger-700/20 bg-danger-700/10 text-danger-700',
        info: 'border-info-600/20 bg-info-600/10 text-info-600',
        // Marigold always carries ink text; white on marigold fails contrast.
        accent: 'border-accent-500 bg-accent-500 text-on-accent',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
