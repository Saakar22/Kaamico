import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './spinner'

export const buttonVariants = cva(
  // A pressed button moves down a pixel: the only motion, and it answers the tap.
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-[color,background-color,border-color,transform] duration-150 select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:translate-y-0 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-fill-brand text-on-fill shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] hover:bg-fill-brand-hover active:bg-fill-brand-hover active:shadow-none',
        // Neutral, so the one green button on a screen is the obvious next step.
        secondary:
          'border border-border bg-surface text-ink-900 shadow-[0_1px_0_rgb(0_0_0/0.04)] hover:border-ink-600/40 hover:bg-surface-muted active:bg-surface-muted',
        tertiary: 'text-brand-700 hover:bg-brand-50 active:bg-brand-50',
        destructive:
          'border border-danger-700 bg-surface text-danger-700 hover:bg-danger-700/5 active:bg-danger-700/10',
        // Filled red is reserved for the confirm button inside confirmation dialogs.
        'destructive-solid': 'bg-fill-danger text-on-fill hover:bg-fill-danger/90',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-base',
        lg: 'h-12 px-6 text-base',
        icon: 'size-11',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a Next.js `<Link>`) with button styles. */
    asChild?: boolean
    /** Shows a spinner and disables the button; pass the in-progress verb as `loadingText`. */
    loading?: boolean
    loadingText?: ReactNode
  }

export function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  loading = false,
  loadingText,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, block }), className)

  if (asChild) {
    return (
      <Slot.Slot className={classes} {...props}>
        {children}
      </Slot.Slot>
    )
  }

  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Spinner />
          {loadingText ?? children}
        </>
      ) : (
        children
      )}
    </button>
  )
}
