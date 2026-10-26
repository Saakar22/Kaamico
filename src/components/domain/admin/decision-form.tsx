'use client'

import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Textarea } from '@/components/ui/input'
import { RadioGroup, RadioOption } from '@/components/ui/radio-group'
import { apiFetch } from '@/lib/api-client'

type Decision = 'APPROVE' | 'REQUEST_RESUBMISSION' | 'REJECT'

const SUBMIT: Record<Decision, string> = {
  APPROVE: 'Approve',
  REQUEST_RESUBMISSION: 'Ask for new documents',
  REJECT: 'Reject',
}

/** Approve, ask for resubmission, or reject; the reason is shown to the professional. */
export function DecisionForm({
  applicationId,
  version,
  workerName,
}: {
  applicationId: string
  version: number
  workerName: string
}) {
  const { pending, error, fieldErrors, run } = useApiAction()
  const [decision, setDecision] = useState<Decision>('APPROVE')
  const [reason, setReason] = useState('')
  const needsReason = decision !== 'APPROVE'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    return run(
      () =>
        apiFetch(`/api/v1/admin/verifications/${applicationId}/decision`, {
          body: { decision, reason: needsReason ? reason : undefined, expectedVersion: version },
        }),
      { success: 'Decision saved' },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-labelledby="decision-title">
      <h2 id="decision-title" className="font-semibold">
        Decision
      </h2>
      <RadioGroup
        value={decision}
        onValueChange={(v) => setDecision(v as Decision)}
        aria-label="Decision"
      >
        <RadioOption
          value="APPROVE"
          label="Approve"
          description={`${workerName} becomes verified and can take bookings.`}
        />
        <RadioOption
          value="REQUEST_RESUBMISSION"
          label="Ask for new documents"
          description="They keep their documents and add what is missing."
        />
        <RadioOption
          value="REJECT"
          label="Reject"
          description="They can apply again after 7 days."
        />
      </RadioGroup>
      {needsReason && (
        <FormField
          label={`Reason (shown to ${workerName})`}
          required
          hint="At least 10 characters. Say what to fix."
          error={fieldErrors.reason}
        >
          {(field) => (
            <Textarea
              {...field}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </FormField>
      )}
      {error && !fieldErrors.reason && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant={decision === 'REJECT' ? 'destructive-solid' : 'primary'}
        className="self-start"
        loading={pending}
        loadingText="Saving…"
        disabled={needsReason && reason.trim().length < 10}
      >
        {SUBMIT[decision]}
      </Button>
    </form>
  )
}
