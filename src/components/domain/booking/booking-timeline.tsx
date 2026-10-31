import { Check, CircleDot, X } from 'lucide-react'
import { htmlLang } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import type { MessageKey, Translate } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import { formatIstDateTime } from '@/lib/time'
import type { HistoryView } from '@/modules/bookings/views'

const STEPS = ['REQUESTED', 'CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'] as const
const ENDINGS: Record<string, MessageKey> = {
  CANCELLED: 'timeline.cancelled',
  EXPIRED: 'timeline.expired',
  DISPUTED: 'timeline.underReview',
}

function stepLabel(
  step: (typeof STEPS)[number],
  viewer: 'customer' | 'worker',
  name: string,
  t: Translate,
) {
  switch (step) {
    case 'REQUESTED':
      return t('timeline.requested')
    case 'CONFIRMED':
      return t('timeline.confirmed')
    case 'EN_ROUTE':
      return viewer === 'customer' ? t('timeline.onTheWay', { name }) : t('timeline.youSetOff')
    case 'ARRIVED':
      return viewer === 'customer' ? t('timeline.arrivedName', { name }) : t('timeline.youArrived')
    case 'IN_PROGRESS':
      return t('timeline.started')
    case 'COMPLETED':
      return t('timeline.completed')
  }
}

type Entry = {
  key: string
  label: string
  at: string | null
  note?: string | null
  state: 'done' | 'current' | 'todo' | 'ended' | 'event'
}

/**
 * Status-based tracking (no live GPS in P0): each step the professional taps, with its
 * time, plus extra-charge decisions. Shared by the customer and worker booking pages.
 */
export async function BookingTimeline({
  history,
  status,
  viewer,
  counterpartName,
}: {
  history: HistoryView[]
  status: string
  viewer: 'customer' | 'worker'
  counterpartName: string
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const reached = new Map<string, HistoryView>()
  for (const h of history) if (h.from !== h.to && !reached.has(h.to)) reached.set(h.to, h)
  const ending = ENDINGS[status] ? history.findLast((h) => h.to === status) : undefined
  const currentIndex = STEPS.findIndex(
    (s) => s === (status === 'NEGOTIATING' ? 'REQUESTED' : status),
  )

  const entries: Entry[] = []
  STEPS.forEach((step, i) => {
    const h = reached.get(step)
    if (h) {
      entries.push({
        key: step,
        label: stepLabel(step, viewer, counterpartName, t),
        at: h.at,
        state: i === currentIndex && step !== 'COMPLETED' ? 'current' : 'done',
      })
    } else if (!ending) {
      entries.push({
        key: step,
        label: stepLabel(step, viewer, counterpartName, t),
        at: null,
        state: 'todo',
      })
    }
  })
  // Same-status entries are decisions within a step (e.g. an approved extra charge).
  history.forEach((h, i) => {
    if (h.from === h.to && h.reason) {
      entries.push({ key: `event-${i}`, label: h.reason, at: h.at, state: 'event' })
    }
  })
  if (ending) {
    entries.push({
      key: status,
      label: t(ENDINGS[status]),
      at: ending.at,
      note: ending.reason,
      state: 'ended',
    })
  }
  // Reached steps and events in time order; steps still to come stay last.
  const timed = entries.filter((e) => e.at).sort((a, b) => a.at!.localeCompare(b.at!))
  const ordered = [...timed, ...entries.filter((e) => !e.at)]

  return (
    <section aria-labelledby="timeline-title" className="flex flex-col gap-3">
      <h2 id="timeline-title" className="font-semibold">
        {t('timeline.title')}
      </h2>
      <ol className="flex flex-col">
        {ordered.map((e, i) => (
          <li
            key={e.key}
            aria-current={e.state === 'current' ? 'step' : undefined}
            className="relative flex gap-3 pb-4 last:pb-0"
          >
            {i < ordered.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute top-7 bottom-0 left-3 w-px -translate-x-1/2 bg-border"
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative flex size-6 shrink-0 items-center justify-center rounded-full border',
                e.state === 'done' && 'border-fill-success bg-fill-success text-on-fill',
                e.state === 'current' && 'border-fill-brand bg-fill-brand text-on-fill',
                e.state === 'todo' && 'border-border bg-surface',
                e.state === 'event' && 'ml-1.5 size-3 border-ink-600/40 bg-surface-muted',
                e.state === 'ended' && 'border-fill-danger bg-fill-danger text-on-fill',
              )}
            >
              {e.state === 'done' && <Check className="size-3.5" />}
              {e.state === 'current' && <CircleDot className="size-3.5" />}
              {e.state === 'ended' && <X className="size-3.5" />}
            </span>
            <div className={cn('flex flex-col', e.state === 'event' && 'text-sm')}>
              <span
                className={cn(
                  e.state === 'todo' ? 'text-ink-600' : 'text-ink-900',
                  e.state === 'current' && 'font-semibold',
                )}
              >
                {e.label}
              </span>
              {e.note && <span className="text-sm text-ink-600">{e.note}</span>}
              {e.at && (
                <time dateTime={e.at} className="text-xs text-ink-600">
                  {formatIstDateTime(new Date(e.at), htmlLang[locale])}
                </time>
              )}
            </div>
          </li>
        ))}
      </ol>
      {viewer === 'customer' && !ending && status !== 'COMPLETED' && (
        <p className="text-xs text-ink-600">
          {t('timeline.updatesNote', { name: counterpartName })}
        </p>
      )}
    </section>
  )
}
