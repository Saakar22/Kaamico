'use client'

import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Textarea } from '@/components/ui/input'
import { apiFetch } from '@/lib/api-client'

/** One public reply to a review; collapsed behind a button until needed. */
export function ReplyForm({ reviewId, author }: { reviewId: string; author: string }) {
  const { pending, error, fieldErrors, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [reply, setReply] = useState('')

  if (!open) {
    return (
      <Button variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)}>
        Reply
      </Button>
    )
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    return run(() => apiFetch(`/api/v1/reviews/${reviewId}/reply`, { body: { reply } }), {
      success: 'Reply posted',
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <FormField
        label={`Your reply to ${author}`}
        hint="Shown under the review on your profile. You can reply once."
        error={fieldErrors.reply}
      >
        {(field) => (
          <Textarea
            {...field}
            rows={3}
            maxLength={500}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
        )}
      </FormField>
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending} loadingText="Posting…">
          Post reply
        </Button>
        <Button type="button" size="sm" variant="tertiary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
