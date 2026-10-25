'use client'

import { CircleCheckBig, MapPinCheck, Navigation, Play } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { apiFetch } from '@/lib/api-client'

type Step = 'EN_ROUTE' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED'

type Action = { to: Step; label: string; icon: typeof Navigation; done: string }

const ACTIONS: Record<string, Action> = {
  CONFIRMED: {
    to: 'EN_ROUTE',
    label: "I'm on my way",
    icon: Navigation,
    done: 'Customer told you are on the way',
  },
  EN_ROUTE: { to: 'ARRIVED', label: "I've arrived", icon: MapPinCheck, done: 'Marked as arrived' },
  IN_PROGRESS: {
    to: 'COMPLETED',
    label: 'Mark job complete',
    icon: CircleCheckBig,
    done: 'Job completed',
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
      if (/^\d{4}$/.test(code)) void move('IN_PROGRESS', 'Job started', code)
    }
    return (
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-semibold">Start the job</h2>
        <FormField
          label={`Start code from ${customerFirstName}`}
          hint={
            locked
              ? 'Too many wrong codes. Contact Kaamico support.'
              : `Ask ${customerFirstName} for the 4-digit code in their app. ${startCodeAttemptsLeft} ${startCodeAttemptsLeft === 1 ? 'try' : 'tries'} left.`
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
          loadingText="Checking…"
        >
          <Play aria-hidden="true" />
          Start job
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
        onClick={() => move(action.to, action.done)}
        disabled={blocked}
        loading={pending}
        loadingText="Updating…"
      >
        <action.icon aria-hidden="true" />
        {action.label}
      </Button>
      {blocked && (
        <p className="text-sm text-ink-600">
          {customerFirstName} has not answered your extra charge yet.
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
