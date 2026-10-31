'use client'

import { CircleCheck } from 'lucide-react'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input, NativeSelect } from '@/components/ui/input'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'

/** "Tell me when you're here" for people outside the service cities. */
export function WaitlistForm({
  categories,
  point,
}: {
  categories: { id: string; name: string }[]
  /** Where the browser said they are, if it did (rounded on the server). */
  point: { lat: number; lng: number } | null
}) {
  const t = useT()
  const { pending, error, fieldErrors, run } = useApiAction()
  const [city, setCity] = useState('')
  const [contact, setContact] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [joinedCity, setJoinedCity] = useState<string>()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    return run(
      async () => {
        await apiFetch('/api/v1/waitlist', {
          body: { city, contact, categoryId: categoryId || undefined, ...point },
        })
        setJoinedCity(city.trim())
      },
      { refresh: false },
    )
  }

  if (joinedCity) {
    return (
      <div role="status" className="flex flex-col items-start gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CircleCheck aria-hidden="true" className="size-5 text-success-800" />
          {t('waitlist.doneTitle')}
        </h2>
        <p className="text-ink-600">{t('waitlist.doneBody', { city: joinedCity })}</p>
        <Button asChild variant="secondary">
          <Link href="/services">{t('waitlist.browse')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FormField label={t('waitlist.city')} required error={fieldErrors.city}>
        {(field) => (
          <Input
            {...field}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            autoComplete="address-level2"
            maxLength={80}
          />
        )}
      </FormField>
      <FormField
        label={t('waitlist.contact')}
        hint={t('waitlist.contactHint')}
        required
        error={fieldErrors.contact}
      >
        {(field) => (
          <Input
            {...field}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            autoComplete="tel"
            maxLength={120}
          />
        )}
      </FormField>
      <FormField label={t('waitlist.service')}>
        {(field) => (
          <NativeSelect
            {...field}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">{t('waitlist.anyService')}</option>
            {categories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="self-start"
        disabled={city.trim().length < 2 || contact.trim().length < 3}
        loading={pending}
        loadingText={t('waitlist.sending')}
      >
        {t('waitlist.submit')}
      </Button>
    </form>
  )
}
