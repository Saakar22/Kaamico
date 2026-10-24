'use client'

import { useState, type ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { parseRupeesInput, type Paise } from '@/lib/money'
import { controlClasses } from './input'

const grouping = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

function display(paise: Paise | null): string {
  return paise === null ? '' : grouping.format(paise / 100)
}

type MoneyInputProps = Omit<
  ComponentProps<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'type'
> & {
  /** Amount in paise, or null when empty or not a valid amount. */
  value: Paise | null
  onValueChange: (paise: Paise | null) => void
}

/**
 * Rupee amount input. Accepts "1,00,000" or "650.50", reports paise, and
 * re-formats with Indian digit grouping when the field loses focus.
 */
export function MoneyInput({
  value,
  onValueChange,
  className,
  onBlur,
  onFocus,
  ...props
}: MoneyInputProps) {
  const [text, setText] = useState(() => display(value))
  const [focused, setFocused] = useState(false)

  // While not editing, show the canonical formatting of the controlled value.
  const shown = focused ? text : value === null ? text : display(value)

  return (
    <div className={cn('relative', className)}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-600"
      >
        ₹
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn(controlClasses, 'h-11 pl-7 tabular-nums')}
        value={shown}
        onFocus={(e) => {
          setFocused(true)
          setText(value === null ? text : display(value))
          onFocus?.(e)
        }}
        onChange={(e) => {
          setText(e.target.value)
          onValueChange(parseRupeesInput(e.target.value))
        }}
        onBlur={(e) => {
          setFocused(false)
          if (value !== null) setText(display(value))
          onBlur?.(e)
        }}
        {...props}
      />
    </div>
  )
}
