'use client'

import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Textarea } from '@/components/ui/input'
import { apiFetch } from '@/lib/api-client'

/** Adds information to an open report (both sides and Kaamico see it). */
export function DisputeNoteForm({ disputeId }: { disputeId: string }) {
  const { pending, error, fieldErrors, run } = useApiAction()
  const [note, setNote] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    return run(
      async () => {
        await apiFetch(`/api/v1/disputes/${disputeId}/evidence`, { body: { note } })
        setNote('')
      },
      { success: 'Note added' },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <FormField
        label="Add information"
        hint="Both sides and Kaamico can read notes."
        error={fieldErrors.note}
      >
        {(field) => (
          <Textarea
            {...field}
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
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
        size="sm"
        variant="secondary"
        className="self-start"
        disabled={note.trim().length < 2}
        loading={pending}
        loadingText="Adding…"
      >
        Add note
      </Button>
    </form>
  )
}
