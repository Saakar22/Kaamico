import { ChevronRight, CircleCheck } from 'lucide-react'
import Link from 'next/link'
import { getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import type { OnboardingState } from '@/modules/workers/onboarding'

/** The six setup steps in order, each linking to where it is done. */
export async function OnboardingChecklist({ state }: { state: OnboardingState }) {
  const t = await getT()
  return (
    <ol
      className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface"
      aria-label={t('onboard.steps')}
    >
      {state.steps.map((step, i) => {
        const isNext = state.next?.key === step.key
        return (
          <li key={step.key}>
            <Link
              href={step.href}
              className={cn(
                'flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-muted',
                isNext && 'bg-brand-50 hover:bg-brand-50',
              )}
              aria-current={isNext ? 'step' : undefined}
            >
              {step.done ? (
                <CircleCheck aria-hidden="true" className="size-7 shrink-0 text-success-700" />
              ) : (
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
                    isNext ? 'border-brand-600 text-brand-700' : 'border-ink-600/50 text-ink-600',
                  )}
                >
                  {i + 1}
                </span>
              )}
              <span className="flex flex-1 flex-col">
                <span className="font-medium">
                  <span className="sr-only">
                    {step.done ? t('onboard.done') : t('onboard.todo')}
                  </span>
                  {t(`onboard.${step.key}Title` as MessageKey)}
                </span>
                <span className="text-sm text-ink-600">
                  {t(`onboard.${step.key}Desc` as MessageKey)}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-600" />
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
