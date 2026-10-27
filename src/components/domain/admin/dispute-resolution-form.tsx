'use client'

import { useState, type FormEvent } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Textarea } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { RadioGroup, RadioOption } from '@/components/ui/radio-group'
import { apiFetch } from '@/lib/api-client'
import { formatINR } from '@/lib/money'

type Decision = 'CUSTOMER_FAVOUR' | 'WORKER_FAVOUR' | 'SPLIT' | 'REJECT'

/**
 * Decision on a reported problem. Refunds apply only to a paid job; the server re-checks
 * every rule and the amount, so this form only guides the admin.
 */
export function DisputeResolutionForm({
  disputeId,
  version,
  refundablePaise,
  paid,
}: {
  disputeId: string
  version: number
  /** What is left of the payment (0 when unpaid). */
  refundablePaise: number
  paid: boolean
}) {
  const { pending, error, fieldErrors, run } = useApiAction()
  const [decision, setDecision] = useState<Decision | ''>('')
  const [refund, setRefund] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const needsRefund = paid && (decision === 'CUSTOMER_FAVOUR' || decision === 'SPLIT')

  const choose = (value: string) => {
    setDecision(value as Decision)
    if (value === 'CUSTOMER_FAVOUR' && paid) setRefund(refundablePaise)
    else if (value !== 'SPLIT') setRefund(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    return run(
      () =>
        apiFetch(`/api/v1/admin/disputes/${disputeId}/resolve`, {
          body: {
            decision,
            refundPaise: needsRefund ? (refund ?? 0) : 0,
            note,
            expectedVersion: version,
          },
        }),
      { success: 'Decision recorded. Both sides have been told.' },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <RadioGroup value={decision} onValueChange={choose} aria-label="Decision">
        <RadioOption
          value="CUSTOMER_FAVOUR"
          label="Customer's favour"
          description={
            paid
              ? 'Refund the customer. A full refund cancels the booking.'
              : 'Cancel the booking; nothing is owed.'
          }
        />
        <RadioOption
          value="WORKER_FAVOUR"
          label="Professional's favour"
          description={
            paid ? 'No refund; the job stands.' : 'The job stands and the customer pays.'
          }
        />
        {paid && (
          <RadioOption
            value="SPLIT"
            label="Split"
            description="Refund part of the payment; the job stands."
          />
        )}
        <RadioOption
          value="REJECT"
          label="Reject the report"
          description="Nothing changes; the booking goes back to where it was."
        />
      </RadioGroup>
      {needsRefund && (
        <FormField
          label="Refund to the customer"
          required
          hint={`Up to ${formatINR(refundablePaise)}. The professional's earnings and Kaamico's fee are adjusted.`}
          error={fieldErrors.refundPaise}
        >
          {(field) => (
            <MoneyInput {...field} value={refund} onValueChange={setRefund} className="sm:w-48" />
          )}
        </FormField>
      )}
      <FormField
        label="Decision note"
        required
        hint="At least 10 characters. Both sides see it, and it is kept in the audit log."
        error={fieldErrors.note}
      >
        {(field) => (
          <Textarea
            {...field}
            rows={3}
            maxLength={2000}
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
        className="self-start"
        disabled={!decision}
        loading={pending}
        loadingText="Saving…"
      >
        Record decision
      </Button>
    </form>
  )
}
