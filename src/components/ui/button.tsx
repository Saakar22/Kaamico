import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './spinner'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-fill-brand text-on-fill hover:bg-fill-brand-hover active:bg-fill-brand-hover',
        secondary:
          'border border-brand-600 bg-surface text-brand-700 hover:bg-brand-50 active:bg-brand-50',
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
