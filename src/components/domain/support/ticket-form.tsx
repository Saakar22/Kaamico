'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { useLocale, useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'
import {
  TICKET_CATEGORIES,
  ticketCategoryLabel,
  type TicketCategory,
} from '@/modules/support/labels'

/** A new help request, optionally about one booking. Opens the thread when sent. */
export function TicketForm({
  basePath,
  booking,
}: {
  basePath: '/support' | '/worker/support'
  booking: { id: string; code: string } | null
}) {
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const { pending, error, fieldErrors, run } = useApiAction()
  const [category, setCategory] = useState<TicketCategory | ''>(booking ? 'BOOKING' : '')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    return run(
      async () => {
        const { ticketId } = await apiFetch<{ ticketId: string }>('/api/v1/support/tickets', {
          body: { category, subject, message, bookingId: booking?.id ?? '' },
        })
        router.push(`${basePath}/${ticketId}`)
      },
      { success: t('support.sent'), refresh: false },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {booking && (
        <p className="text-sm text-ink-600">
          {t('support.aboutBooking')}{' '}
          <span className="font-medium text-ink-900">{booking.code}</span>
        </p>
      )}
      <FormField label={t('support.topic')} required error={fieldErrors.category}>
        {(field) => (
          <NativeSelect
            {...field}
            value={category}
            onChange={(e) => setCategory(e.target.value as TicketCategory)}
          >
            <option value="">{t('support.chooseOne')}</option>
            {TICKET_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {ticketCategoryLabel(value, locale)}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField label={t('support.subject')} required error={fieldErrors.subject}>
        {(field) => (
          <Input
            {...field}
            maxLength={150}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        )}
      </FormField>
      <FormField
        label={t('support.howHelp')}
        required
        hint={t('support.noSecrets')}
        error={fieldErrors.message}
      >
        {(field) => (
          <Textarea
            {...field}
            rows={5}
            maxLength={4000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
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
        disabled={!category}
        loading={pending}
        loadingText={t('support.sending')}
      >
        {t('support.send')}
      </Button>
    </form>
  )
}
