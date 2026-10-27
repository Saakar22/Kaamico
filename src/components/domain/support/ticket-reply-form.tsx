'use client'

import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Textarea } from '@/components/ui/input'
import { apiFetch } from '@/lib/api-client'

/** Adds a message to a help request (the owner or a Kaamico admin). */
export function TicketReplyForm({
  ticketId,
  hint,
  label = 'Your message',
}: {
  ticketId: string
  hint?: string
  label?: string
}) {
  const { pending, error, fieldErrors, run } = useApiAction()
  const [body, setBody] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    return run(
      async () => {
        await apiFetch(`/api/v1/support/tickets/${ticketId}/messages`, { body: { body } })
        setBody('')
      },
      { success: 'Message sent' },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <FormField label={label} hint={hint} error={fieldErrors.body}>
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
        loadingText="Sending…"
      >
        Send
      </Button>
    </form>
  )
}
