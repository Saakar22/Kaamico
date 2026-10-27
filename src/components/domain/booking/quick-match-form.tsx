'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Textarea } from '@/components/ui/input'
import { RadioGroup, RadioOption } from '@/components/ui/radio-group'
import { apiFetch } from '@/lib/api-client'
import type { SavedAddress } from '@/modules/addresses/addresses'

/** Sends one "now" request to the nearest free professionals; the first to accept is booked. */
export function QuickMatchForm({
  serviceId,
  addresses,
}: {
  serviceId: string
  addresses: SavedAddress[]
}) {
  const router = useRouter()
  const { pending, error, fieldErrors, run } = useApiAction()
  const [addressId, setAddressId] = useState(
    () => (addresses.find((a) => a.isDefault) ?? addresses[0])?.id ?? '',
  )
  const [description, setDescription] = useState('')
  const [key] = useState(() => crypto.randomUUID())

  const submit = (event: FormEvent) => {
    event.preventDefault()
    return run(
      async () => {
        const { bookingId } = await apiFetch<{ bookingId: string }>('/api/v1/bookings', {
          body: { mode: 'BROADCAST', serviceId, addressId, description: description || undefined },
          idempotencyKey: key,
        })
        router.push(`/bookings/${bookingId}/negotiate`)
      },
      { refresh: false },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <RadioGroup value={addressId} onValueChange={setAddressId} aria-label="Where is the job?">
        {addresses.map((a) => (
          <RadioOption
            key={a.id}
            value={a.id}
            label={a.line1}
            description={[a.locality, a.city].filter(Boolean).join(', ')}
          />
        ))}
      </RadioGroup>
      <FormField
        label="What needs doing? (optional)"
        hint="Helps professionals decide quickly."
        error={fieldErrors.description}
      >
        {(field) => (
          <Textarea
            {...field}
            rows={3}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </FormField>
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        className="self-start"
        disabled={!addressId}
        loading={pending}
        loadingText="Sending…"
      >
        Send to nearby professionals
      </Button>
    </form>
  )
}
