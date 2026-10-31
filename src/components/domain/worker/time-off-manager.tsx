'use client'

import { CalendarOff, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { useLocale, useT } from '@/i18n/client'
import { htmlLang } from '@/i18n/config'
import { apiFetch, ApiError } from '@/lib/api-client'
import { formatIstDateTime } from '@/lib/time'
import { useApiAction } from './use-api-action'

type TimeOff = { id: string; start: string; end: string; reason: string | null }
type Clash = { code: string; start: string; end: string }

/** `<input type="datetime-local">` values are wall-clock; Kaamico schedules in IST. */
const fromLocalIst = (value: string) => new Date(`${value}:00+05:30`).toISOString()

export function TimeOffManager({ initial }: { initial: TimeOff[] }) {
  const t = useT()
  const lang = htmlLang[useLocale()]
  const when = (iso: string) => formatIstDateTime(new Date(iso), lang)
  const { pending, error, fieldErrors, run } = useApiAction()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [clashes, setClashes] = useState<Clash[]>([])

  const add = (event: FormEvent) => {
    event.preventDefault()
    setClashes([])
    return run(
      async () => {
        try {
          await apiFetch('/api/v1/worker/time-off', {
            body: { start: fromLocalIst(start), end: fromLocalIst(end), reason },
          })
        } catch (e) {
          if (e instanceof ApiError && e.code === 'TIME_OFF_CONFLICT') {
            setClashes((e.details?.bookings as Clash[]) ?? [])
          }
          throw e
        }
        setStart('')
        setEnd('')
        setReason('')
      },
      { success: t('whours.timeOffAdded') },
    )
  }

  const remove = (id: string) =>
    run(() => apiFetch(`/api/v1/worker/time-off/${id}`, { method: 'DELETE' }), {
      success: t('whours.timeOffRemoved'),
    })

  return (
    <div className="flex flex-col gap-5">
      {initial.length === 0 ? (
        <p className="flex items-center gap-2 text-ink-600">
          <CalendarOff aria-hidden="true" className="size-5" />
          {t('whours.noTimeOff')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {initial.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 p-3">
              <span>
                <span className="block font-medium">
                  {when(item.start)} – {when(item.end)}
                </span>
                {item.reason && <span className="text-sm text-ink-600">{item.reason}</span>}
              </span>
              <Button
                variant="tertiary"
                size="icon"
                aria-label={t('whours.removeTimeOff', { start: when(item.start) })}
                onClick={() => remove(item.id)}
                disabled={pending}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('whours.from')} required error={fieldErrors.start}>
            {(field) => (
              <Input
                {...field}
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t('whours.until')} required error={fieldErrors.end}>
            {(field) => (
              <Input
                {...field}
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            )}
          </FormField>
        </div>
        <FormField label={t('whours.reason')} error={fieldErrors.reason}>
          {(field) => (
            <Input
              {...field}
              value={reason}
              maxLength={120}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </FormField>
        {error && (
          <div className="text-sm text-danger-700" role="alert">
            <p>{error}</p>
            {clashes.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {clashes.map((c) => (
                  <li key={c.code}>
                    {t('whours.bookingClash', { code: c.code, start: when(c.start) })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <Button
          type="submit"
          variant="secondary"
          loading={pending}
          loadingText={t('whours.adding')}
          disabled={!start || !end}
          className="self-start"
        >
          {t('whours.addTimeOff')}
        </Button>
      </form>
    </div>
  )
}
