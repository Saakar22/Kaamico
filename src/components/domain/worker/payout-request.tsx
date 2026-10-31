'use client'

import { useState } from 'react'
import { SimulationBadge } from '@/components/domain/trust-badges'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { MoneyInput } from '@/components/ui/money-input'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'
import { formatINR } from '@/lib/money'
import { useApiAction } from './use-api-action'

/** Ask for a payout of the money that is ready (§10.13). Simulated: nothing is transferred. */
export function PayoutRequest({
  availablePaise,
  minimumPaise,
}: {
  availablePaise: number
  minimumPaise: number
}) {
  const t = useT()
  const { pending, error, fieldErrors, run } = useApiAction()
  const [amount, setAmount] = useState<number | null>(availablePaise)
  const [key, setKey] = useState(() => crypto.randomUUID())

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    void run(
      async () => {
        await apiFetch('/api/v1/worker/payouts/request', {
          body: { amountPaise: amount ?? 0 },
          idempotencyKey: key,
        })
        setKey(crypto.randomUUID())
      },
      { success: t('wearn.requested') },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <FormField
        label={t('wearn.amountToPay')}
        hint={t('wearn.between', { min: formatINR(minimumPaise), max: formatINR(availablePaise) })}
        error={fieldErrors.amountPaise ?? error}
      >
        {(field) => (
          <MoneyInput {...field} value={amount} onValueChange={setAmount} className="sm:w-48" />
        )}
      </FormField>
      <div className="flex flex-wrap items-center gap-3 sm:pb-6">
        <Button
          type="submit"
          loading={pending}
          loadingText={t('wearn.requesting')}
          disabled={!amount}
        >
          {t('wearn.request')}
        </Button>
        <SimulationBadge label={t('wearn.simulatedPayout')} />
      </div>
    </form>
  )
}
