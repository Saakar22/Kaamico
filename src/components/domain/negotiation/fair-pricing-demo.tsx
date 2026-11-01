'use client'

import { Check, Lock, Star, Users } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Money } from '@/components/ui/money'
import { useT } from '@/i18n/client'
import type { MessageKey } from '@/i18n/translate'
import { cn } from '@/lib/cn'

const STEPS: { title: MessageKey; body: MessageKey }[] = [
  { title: 'home.step1Title', body: 'home.step1Body' },
  { title: 'home.step2Title', body: 'home.step2Body' },
  { title: 'home.step3Title', body: 'home.step3Body' },
]

/** Illustrative professionals for the comparison scene (not real listings). */
const PROS = [
  { name: 'Rakesh Patil', rating: '4.8', km: '1.2', paise: 29000 },
  { name: 'Imran Shaikh', rating: '4.9', km: '2.0', paise: 32000 },
  { name: 'Sunil Jadhav', rating: '4.6', km: '3.4', paise: 26000 },
]

/**
 * One scene of the illustration. Its children arrive one after another when it becomes
 * the active scene (`Arrive` reads the scene's data-active).
 */
function Scene({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      data-active={active}
      className={cn(
        'group/scene absolute inset-0 flex flex-col gap-3 p-5 transition-opacity duration-300 motion-reduce:transition-none sm:p-6',
        active ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {children}
    </div>
  )
}

function Arrive({
  order,
  from = 'below',
  className,
  children,
}: {
  order: number
  from?: 'below' | 'left' | 'right'
  className?: string
  children: ReactNode
}) {
  const style = { '--delay': `${60 + order * 70}ms` } as CSSProperties
  return (
    <div
      style={style}
      className={cn(
        'opacity-0 transition-[opacity,translate] duration-300 ease-out motion-reduce:translate-x-0 motion-reduce:translate-y-0 motion-reduce:transition-none',
        'group-data-[active=true]/scene:translate-x-0 group-data-[active=true]/scene:translate-y-0 group-data-[active=true]/scene:opacity-100 group-data-[active=true]/scene:delay-(--delay)',
        from === 'below' && 'translate-y-3',
        from === 'left' && '-translate-x-4',
        from === 'right' && 'translate-x-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

function SceneHeader() {
  const t = useT()
  return (
    <Arrive
      order={0}
      className="flex items-baseline justify-between border-b border-border pb-3 text-sm text-ink-600"
    >
      <span>Tap repair · Kothrud</span>
      <span>
        {t('price.listed')} <Money paise={29000} className="font-semibold text-ink-900" />
      </span>
    </Arrive>
  )
}

/** Step 1: three nearby professionals, each with their own price. */
function CompareScene({ active }: { active: boolean }) {
  const t = useT()
  return (
    <Scene active={active}>
      <Arrive order={0} className="pb-1 text-sm text-ink-600">
        Tap repair · Kothrud
      </Arrive>
      {PROS.map((pro, i) => (
        <Arrive
          key={pro.name}
          order={i + 1}
          className={cn(
            'flex items-center gap-3 rounded-lg p-3 ring-1',
            i === 0 ? 'bg-brand-50 ring-brand-600/40' : 'bg-surface ring-border',
          )}
        >
          <Avatar name={pro.name} size="sm" className="size-10" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold">{pro.name}</span>
            <span className="flex items-center gap-1 text-xs text-ink-600">
              <Star aria-hidden="true" className="size-3 fill-accent-500 text-accent-500" />
              {pro.rating} · {t('proCard.kmAway', { km: pro.km })}
            </span>
          </span>
          <Money paise={pro.paise} className="font-display text-xl font-semibold" />
        </Arrive>
      ))}
      <Arrive order={4} className="mt-auto flex items-center gap-2 text-sm text-ink-600">
        <Users aria-hidden="true" className="size-4 shrink-0" />
        {t('catalog.setThemselves', { count: PROS.length })}
      </Arrive>
    </Scene>
  )
}

/** Step 2: the customer offers less; the professional meets them partway. */
function OfferScene({ active }: { active: boolean }) {
  const t = useT()
  return (
    <Scene active={active}>
      <SceneHeader />
      <Arrive
        order={1}
        from="right"
        className="ml-auto flex w-[76%] flex-col gap-1 rounded-lg rounded-br-sm bg-fill-brand px-4 py-3 text-on-fill"
      >
        <span className="text-xs">{t('offer.yours')}</span>
        <Money paise={24000} className="font-display text-3xl font-semibold" />
      </Arrive>
      <Arrive
        order={3}
        from="left"
        className="flex w-[76%] flex-col gap-1 rounded-lg rounded-bl-sm bg-surface-muted px-4 py-3"
      >
        <span className="flex items-center justify-between gap-2 text-xs text-ink-600">
          {t('offer.theirs', { name: 'Rakesh' })}
          <span className="rounded-sm bg-accent-100 px-1.5 py-0.5 font-semibold text-warning-800">
            {t('offer.final')}
          </span>
        </span>
        <Money paise={26500} className="font-display text-3xl font-semibold" />
      </Arrive>
      {/* What the customer does next: the accept button, as in the real thread. */}
      <Arrive
        order={5}
        className="mt-auto flex h-11 items-center justify-center gap-1 rounded-md bg-fill-brand font-semibold text-on-fill"
      >
        {t('thread.accept')} <Money paise={26500} />
      </Arrive>
    </Scene>
  )
}

/** Step 3: agreed and locked, as a receipt. */
function LockedScene({ active }: { active: boolean }) {
  const t = useT()
  return (
    <Scene active={active}>
      <SceneHeader />
      <Arrive order={1} className="flex flex-col items-center gap-2 py-2">
        <span
          className={cn(
            'flex size-14 items-center justify-center rounded-full bg-accent-100 text-warning-800 ring-1 ring-accent-500/50 transition-transform duration-300 ease-out motion-reduce:transition-none',
            active ? 'scale-100 delay-150' : 'scale-50',
          )}
        >
          <Lock aria-hidden="true" className="size-6" />
        </span>
        <Money paise={26500} className="font-display text-5xl leading-none font-semibold" />
      </Arrive>
      <Arrive
        order={2}
        className="flex flex-col gap-1.5 border-t border-dashed border-rule pt-3 text-sm"
      >
        <span className="flex justify-between text-ink-600">
          {t('price.listed')} <Money paise={29000} className="line-through" />
        </span>
        <span className="flex justify-between text-ink-600">
          {t('offer.yours')} <Money paise={24000} />
        </span>
        <span className="flex justify-between font-semibold">
          {t('offer.final')} <Money paise={26500} />
        </span>
      </Arrive>
      <Arrive
        order={3}
        className="mt-auto flex items-center gap-2 rounded-lg bg-accent-100 px-4 py-3 text-sm font-semibold ring-1 ring-accent-500/50"
      >
        <Check aria-hidden="true" className="size-4 shrink-0 text-warning-800" />
        {t('thread.priceLocked')} <Money paise={26500} />
      </Arrive>
    </Scene>
  )
}

/**
 * "How fair pricing works" on the home page: three steps beside a live illustration of
 * each. It plays through on its own while on screen (a bar fills on the active step),
 * pauses on hover or focus, and any step can be chosen. With reduced motion it does not
 * advance by itself. The illustration repeats the steps' text, so it is hidden from
 * assistive tech.
 */
export function FairPricingDemo() {
  const t = useT()
  const [step, setStep] = useState(0)
  const [onScreen, setOnScreen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      threshold: 0.4,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="group/demo grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-24"
    >
      <ol className="flex flex-col">
        {STEPS.map((s, i) => {
          const active = i === step
          return (
            <li key={s.title} className="relative border-t border-border last:border-b">
              {active && (
                // Remounted per step so it starts empty; when it fills, the next step plays.
                <span
                  key={step}
                  aria-hidden="true"
                  onAnimationEnd={() => setStep((step + 1) % STEPS.length)}
                  className={cn(
                    'absolute inset-x-0 -top-px h-0.5 origin-left animate-step-progress bg-brand-600 motion-reduce:hidden',
                    'group-focus-within/demo:[animation-play-state:paused] group-hover/demo:[animation-play-state:paused]',
                    !onScreen && '[animation-play-state:paused]',
                  )}
                />
              )}
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={active ? 'step' : undefined}
                className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 py-5 text-left"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'row-span-2 font-display text-2xl leading-7 font-semibold tabular-nums transition-colors motion-reduce:transition-none',
                    active ? 'text-brand-700' : 'text-ink-600/60',
                  )}
                >
                  {i + 1}
                </span>
                <span
                  className={cn(
                    'text-lg font-semibold transition-colors motion-reduce:transition-none',
                    active ? 'text-ink-900' : 'text-ink-600 hover:text-ink-900',
                  )}
                >
                  {t(s.title)}
                </span>
                {/* Folded away when inactive, but still read out by screen readers. */}
                <span
                  className={cn(
                    'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                    active ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                  )}
                >
                  <span className="min-h-0 overflow-hidden">
                    <span className="block max-w-[36rem] pt-1 text-ink-600">{t(s.body)}</span>
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <div
        aria-hidden="true"
        className="relative h-[23rem] overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-float)] ring-1 ring-border"
      >
        <CompareScene active={step === 0} />
        <OfferScene active={step === 1} />
        <LockedScene active={step === 2} />
      </div>
    </div>
  )
}
