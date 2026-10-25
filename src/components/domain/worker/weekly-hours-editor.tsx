'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/input'
import { apiFetch } from '@/lib/api-client'
import { useApiAction } from './use-api-action'

type Rule = { weekday: number; startMinute: number; endMinute: number }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MAX_PER_DAY = 3
const STEP = 30

function label(minute: number): string {
  if (minute === 1440) return '12:00 midnight'
  const h = Math.floor(minute / 60)
  const m = minute % 60
  const suffix = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

const TIMES = Array.from({ length: 1440 / STEP + 1 }, (_, i) => i * STEP)

/** Weekly hours: up to 3 windows per day, checked again on the server. */
export function WeeklyHoursEditor({ initial }: { initial: Rule[] }) {
  const { pending, error, run } = useApiAction()
  const [rules, setRules] = useState<Rule[]>(initial)

  const update = (index: number, change: Partial<Rule>) =>
    setRules((r) => r.map((rule, i) => (i === index ? { ...rule, ...change } : rule)))

  function addWindow(weekday: number) {
    const day = rules.filter((r) => r.weekday === weekday)
    const last = day.reduce((m, r) => Math.max(m, r.endMinute), 8 * 60)
    const start = Math.min(last + 60, 22 * 60)
    setRules((r) => [
      ...r,
      { weekday, startMinute: start, endMinute: Math.min(start + 4 * 60, 1440) },
    ])
  }

  function copyMondayToWeekdays() {
    const monday = rules.filter((r) => r.weekday === 0)
    setRules([
      ...monday,
      ...[1, 2, 3, 4, 5].flatMap((weekday) => monday.map((r) => ({ ...r, weekday }))),
      ...rules.filter((r) => r.weekday === 6),
    ])
  }

  const problems = DAYS.map((_, weekday) => {
    const day = rules
      .filter((r) => r.weekday === weekday)
      .sort((a, b) => a.startMinute - b.startMinute)
    if (day.some((r) => r.endMinute <= r.startMinute))
      return 'An end time is before its start time.'
    if (day.some((r, i) => i > 0 && r.startMinute < day[i - 1].endMinute)) return 'Times overlap.'
    return null
  })

  const save = (event: FormEvent) => {
    event.preventDefault()
    return run(() => apiFetch('/api/v1/worker/availability', { method: 'PUT', body: { rules } }), {
      success: 'Working hours saved',
    })
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {DAYS.map((day, weekday) => {
          const windows = rules
            .map((rule, index) => ({ rule, index }))
            .filter(({ rule }) => rule.weekday === weekday)
          return (
            <li key={day} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-4">
              <span className="w-28 shrink-0 pt-2.5 font-medium">{day}</span>
              <div className="flex flex-1 flex-col gap-2">
                {windows.length === 0 && <span className="pt-2.5 text-ink-600">Not working</span>}
                {windows.map(({ rule, index }) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <NativeSelect
                      aria-label={`${day} start`}
                      value={rule.startMinute}
                      onChange={(e) => update(index, { startMinute: Number(e.target.value) })}
                      className="w-36"
                    >
                      {TIMES.slice(0, -1).map((t) => (
                        <option key={t} value={t}>
                          {label(t)}
                        </option>
                      ))}
                    </NativeSelect>
                    <span aria-hidden="true">to</span>
                    <NativeSelect
                      aria-label={`${day} end`}
                      value={rule.endMinute}
                      onChange={(e) => update(index, { endMinute: Number(e.target.value) })}
                      className="w-40"
                    >
                      {TIMES.slice(1).map((t) => (
                        <option key={t} value={t}>
                          {label(t)}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button
                      variant="tertiary"
                      size="icon"
                      aria-label={`Remove ${day} ${label(rule.startMinute)} to ${label(rule.endMinute)}`}
                      onClick={() => setRules((r) => r.filter((_, i) => i !== index))}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                {problems[weekday] && (
                  <p className="text-sm text-danger-700" role="alert">
                    {problems[weekday]}
                  </p>
                )}
                {windows.length < MAX_PER_DAY && (
                  <Button
                    variant="tertiary"
                    size="sm"
                    className="self-start"
                    onClick={() => addWindow(weekday)}
                  >
                    <Plus aria-hidden="true" />
                    Add hours<span className="sr-only"> on {day}</span>
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          loading={pending}
          loadingText="Saving…"
          disabled={problems.some(Boolean)}
        >
          Save working hours
        </Button>
        <Button variant="secondary" onClick={copyMondayToWeekdays}>
          Copy Monday to Tue–Sat
        </Button>
      </div>
    </form>
  )
}
