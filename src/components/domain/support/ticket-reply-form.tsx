'use client'

import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Textarea } from '@/components/ui/input'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'

/** Adds a message to a help request (the owner or a Kaamico admin). */
export function TicketReplyForm({
  ticketId,
  hint,
  label,
}: {
  ticketId: string
  hint?: string
  label?: string
}) {
  const t = useT()
  const { pending, error, fieldErrors, run } = useApiAction()
  const [body, setBody] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    return run(
      async () => {
        await apiFetch(`/api/v1/support/tickets/${ticketId}/messages`, { body: { body } })
        setBody('')
      },
      { success: t('support.messageSent') },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <FormField label={label ?? t('support.yourMessage')} hint={hint} error={fieldErrors.body}>
        {(field) => (
          <Textarea
            {...field}
            rows={3}
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
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
        disabled={!body.trim()}
        loading={pending}
        loadingText={t('support.sending')}
      >
        {t('support.sendMessage')}
      </Button>
    </form>
  )
}
