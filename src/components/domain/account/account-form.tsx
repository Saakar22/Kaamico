'use client'

import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'

/** Name and optional email; the phone number is the sign-in and cannot change here. */
export function AccountForm({
  name: initialName,
  email: initialEmail,
  phone,
}: {
  name: string
  email: string
  phone: string | null
}) {
  const t = useT()
  const { pending, error, fieldErrors, run } = useApiAction()
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState(initialEmail)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    return run(() => apiFetch('/api/v1/me', { method: 'PATCH', body: { name, email } }), {
      success: t('account.saved_'),
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FormField label={t('account.name')} required error={fieldErrors.name}>
        {(field) => (
          <Input
            {...field}
            autoComplete="name"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </FormField>
      <FormField label={t('account.mobile')} hint={t('account.mobileHint')}>
        {(field) => <Input {...field} value={phone ?? ''} readOnly />}
      </FormField>
      <FormField label={t('account.email')} hint={t('account.emailHint')} error={fieldErrors.email}>
        {(field) => (
          <Input
            {...field}
            type="email"
            autoComplete="email"
            maxLength={120}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
        className="self-start"
        loading={pending}
        loadingText={t('account.saving')}
      >
        {t('account.save')}
      </Button>
    </form>
  )
}
