'use client'

import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Textarea } from '@/components/ui/input'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'

/** Adds information to an open report (both sides and Kaamico see it). */
export function DisputeNoteForm({ disputeId }: { disputeId: string }) {
  const t = useT()
  const { pending, error, fieldErrors, run } = useApiAction()
  const [note, setNote] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    return run(
      async () => {
        await apiFetch(`/api/v1/disputes/${disputeId}/evidence`, { body: { note } })
        setNote('')
      },
      { success: t('dispute.noteAdded') },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <FormField
        label={t('dispute.addInfo')}
        hint={t('dispute.addInfoHint')}
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
        loadingText={t('dispute.adding')}
      >
        {t('dispute.addNote')}
      </Button>
    </form>
  )
}
