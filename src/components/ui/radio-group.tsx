'use client'

import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function RadioGroup({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root className={cn('grid gap-2', className)} {...props} />
}

/** A full-width, tappable option card with a label and optional description. */
export function RadioOption({
  value,
  label,
  description,
  disabled,
  className,
}: {
  value: string
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <label
      className={cn(
        // Disabled options use a muted background, not opacity, so their text keeps full contrast.
        'flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:border-dashed has-[:disabled]:bg-surface-muted has-[[data-state=checked]]:border-brand-600 has-[[data-state=checked]]:bg-brand-50',
        className,
      )}
    >
      <RadioGroupPrimitive.Item
        value={value}
        disabled={disabled}
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-ink-600 data-[state=checked]:border-brand-600"
      >
        <RadioGroupPrimitive.Indicator className="size-2.5 rounded-full bg-brand-600" />
      </RadioGroupPrimitive.Item>
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{label}</span>
        {description && <span className="text-sm text-ink-600">{description}</span>}
      </span>
    </label>
  )
}
