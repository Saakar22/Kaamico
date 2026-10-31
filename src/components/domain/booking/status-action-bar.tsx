'use client'

import { CircleCheckBig, MapPinCheck, Navigation, Play } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { useT } from '@/i18n/client'
import type { MessageKey } from '@/i18n/translate'
import { apiFetch } from '@/lib/api-client'

type Step = 'EN_ROUTE' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED'

type Action = { to: Step; label: MessageKey; icon: typeof Navigation; done: MessageKey }

const ACTIONS: Record<string, Action> = {
  CONFIRMED: {
    to: 'EN_ROUTE',
    label: 'action.onMyWay',
    icon: Navigation,
    done: 'action.onMyWayDone',
  },
  EN_ROUTE: {
    to: 'ARRIVED',
    label: 'action.arrived',
    icon: MapPinCheck,
    done: 'action.arrivedDone',
  },
  IN_PROGRESS: {
    to: 'COMPLETED',
    label: 'action.complete',
    icon: CircleCheckBig,
    done: 'action.completeDone',
  },
}

/**
 * The one next step for the professional (§4 worker step 8). Starting work needs the
 * customer's 4-digit code; the server checks it and counts wrong attempts.
 */
export function StatusActionBar({
  bookingId,
  status,
  version,
  customerFirstName,
  startCodeAttemptsLeft,
  chargePending,
}: {
  bookingId: string
  status: string
  version: number
  customerFirstName: string
  startCodeAttemptsLeft: number
  chargePending: boolean
}) {
  const t = useT()
  const { pending, error, run } = useApiAction()
  const [code, setCode] = useState('')

  const move = (to: Step, success: string, startCode?: string) =>
    run(
      async () => {
        await apiFetch(`/api/v1/bookings/${bookingId}/transitions`, {
          body: { to, expectedVersion: version, startCode },
        })
        setCode('')
      },
      { success },
    )

  if (status === 'ARRIVED') {
    const locked = startCodeAttemptsLeft === 0
    const submit = (event: FormEvent) => {
      event.preventDefault()
      if (/^\d{4}$/.test(code)) void move('IN_PROGRESS', t('action.started'), code)
    }
    return (
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border border-border p-4">
        <h2 className="font-semibold">{t('action.startTitle')}</h2>
        <FormField
          label={t('action.codeFrom', { name: customerFirstName })}
          hint={
            locked
              ? t('action.locked')
              : t(startCodeAttemptsLeft === 1 ? 'action.askCodeOne' : 'action.askCodeOther', {
                  name: customerFirstName,
                  count: startCodeAttemptsLeft,
                })
          }
          error={error}
        >
          {(field) => (
            <Input
              {...field}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{4}"
              maxLength={4}
              disabled={locked}
              className="w-32 font-mono text-xl tracking-[0.3em]"
            />
          )}
        </FormField>
        <Button
          type="submit"
          size="lg"
          className="self-start"
          disabled={locked || code.length !== 4}
          loading={pending}
          loadingText={t('action.checking')}
        >
          <Play aria-hidden="true" />
          {t('action.start')}
        </Button>
      </form>
    )
  }

  const action = ACTIONS[status]
  if (!action) return null
  const blocked = action.to === 'COMPLETED' && chargePending
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        block
        onClick={() => move(action.to, t(action.done))}
        disabled={blocked}
        loading={pending}
        loadingText={t('action.updating')}
      >
        <action.icon aria-hidden="true" />
        {t(action.label)}
      </Button>
      {blocked && (
        <p className="text-sm text-ink-600">
          {t('action.chargeUnanswered', { name: customerFirstName })}
        </p>
      )}
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
