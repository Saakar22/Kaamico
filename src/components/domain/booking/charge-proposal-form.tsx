'use client'

import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input, NativeSelect } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { useT } from '@/i18n/client'
import type { MessageKey } from '@/i18n/translate'
import { apiFetch } from '@/lib/api-client'

const KINDS = [
  { value: 'MATERIALS', label: 'extra.materials' },
  { value: 'EXTRA_WORK', label: 'extra.work' },
  { value: 'OTHER', label: 'extra.other' },
] as const satisfies readonly { value: string; label: MessageKey }[]

/** On site, the professional asks for an extra charge; it counts only once the customer approves. */
export function ChargeProposalForm({
  bookingId,
  customerFirstName,
}: {
  bookingId: string
  customerFirstName: string
}) {
  const t = useT()
  const { pending, error, fieldErrors, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('MATERIALS')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  // One key per charge, so a double tap cannot add it twice.
  const [key, setKey] = useState(() => crypto.randomUUID())

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (amount === null) return
    return run(
      async () => {
        await apiFetch(`/api/v1/bookings/${bookingId}/charges`, {
          body: { kind, description, amountPaise: amount },
          idempotencyKey: key,
        })
        setKey(crypto.randomUUID())
        setDescription('')
        setAmount(null)
        setOpen(false)
      },
      { success: t('extra.sent', { name: customerFirstName }) },
    )
  }

  if (!open) {
    return (
      <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        {t('extra.add')}
      </Button>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border border-border p-4">
      <h2 className="font-semibold">{t('extra.title')}</h2>
      <p className="text-sm text-ink-600">
        {t('extra.approvesFirst', { name: customerFirstName })}
      </p>
      <FormField label={t('extra.type')}>
        {(field) => (
          <NativeSelect
            {...field}
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {t(k.label)}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField label={t('extra.what')} required error={fieldErrors.description}>
        {(field) => (
          <Input
            {...field}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            placeholder={t('extra.placeholder')}
          />
        )}
      </FormField>
      <FormField
        label={t('extra.amount')}
        required
        className="sm:w-48"
        error={fieldErrors.amountPaise}
      >
        {(field) => <MoneyInput {...field} value={amount} onValueChange={setAmount} />}
      </FormField>
      {error && !Object.keys(fieldErrors).length && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          loading={pending}
          loadingText={t('extra.sending')}
          disabled={amount === null || description.trim().length < 3}
        >
          {t('extra.send')}
        </Button>
        <Button type="button" variant="tertiary" onClick={() => setOpen(false)}>
          {t('extra.cancel')}
        </Button>
      </div>
    </form>
  )
}
