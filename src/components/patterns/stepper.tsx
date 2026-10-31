'use client'

import { Check } from 'lucide-react'
import { useT } from '@/i18n/client'
import { cn } from '@/lib/cn'

/** Progress through a multi-step flow (booking wizard, worker onboarding). */
export function Stepper({
  steps,
  current,
  className,
}: {
  steps: readonly string[]
  /** Zero-based index of the active step. */
  current: number
  className?: string
}) {
  const t = useT()
  return (
    <nav aria-label={t('stepper.progress')} className={className}>
      <p className="mb-2 text-sm text-ink-600 sm:hidden">
        {t('stepper.stepOf', { current: current + 1, total: steps.length })}{' '}
        <span className="font-medium text-ink-900">{steps[current]}</span>
      </p>
      <ol className="flex items-center gap-2">
        {steps.map((step, i) => {
          const done = i < current
          const active = i === current
          return (
            <li
              key={step}
              className="flex flex-1 items-center gap-2"
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  done && 'border-fill-brand bg-fill-brand text-on-fill',
                  active && 'border-brand-600 text-brand-700',
                  !done && !active && 'border-border text-ink-600',
                )}
              >
                {done ? <Check aria-hidden="true" className="size-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  'hidden text-sm sm:inline',
                  active ? 'font-medium text-ink-900' : 'text-ink-600',
                )}
              >
                {step}
                {done && <span className="sr-only"> (completed)</span>}
              </span>
              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn('h-0.5 flex-1 rounded', done ? 'bg-brand-600' : 'bg-border')}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
