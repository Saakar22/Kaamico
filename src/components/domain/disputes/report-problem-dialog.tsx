'use client'

import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { NativeSelect, Textarea } from '@/components/ui/input'
import { apiFetch } from '@/lib/api-client'
import {
  DISPUTE_REASON_LABELS,
  DISPUTE_REASONS,
  type DisputeReason,
} from '@/modules/disputes/labels'

/**
 * "Report a problem" with a job. During the job only a safety concern can be reported
 * here; afterwards any problem, for 72 hours. Kaamico reviews it and both sides are told.
 */
export function ReportProblemDialog({
  bookingId,
  safetyOnly,
}: {
  bookingId: string
  safetyOnly: boolean
}) {
  const { pending, error, fieldErrors, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<DisputeReason | ''>(safetyOnly ? 'SAFETY' : '')
  const [description, setDescription] = useState('')
  const [key] = useState(() => crypto.randomUUID())
  const reasons = safetyOnly ? (['SAFETY'] as const) : DISPUTE_REASONS

  const submit = () =>
    run(
      async () => {
        await apiFetch(`/api/v1/bookings/${bookingId}/disputes`, {
          body: { reason, description },
          idempotencyKey: key,
        })
        setOpen(false)
      },
      { success: 'Thanks. Kaamico will look into it.' },
    )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <TriangleAlert aria-hidden="true" />
          {safetyOnly ? 'Report a safety concern' : 'Report a problem'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{safetyOnly ? 'Report a safety concern' : 'Report a problem'}</DialogTitle>
          <DialogDescription>
            Kaamico will look at the booking history and both sides&apos; account, and may refund
            some or all of the payment. In an emergency, call 112.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FormField label="What went wrong?" required error={fieldErrors.reason}>
            {(field) => (
              <NativeSelect
                {...field}
                value={reason}
                onChange={(e) => setReason(e.target.value as DisputeReason)}
              >
                {!safetyOnly && <option value="">Choose one</option>}
                {reasons.map((r) => (
                  <option key={r} value={r}>
                    {DISPUTE_REASON_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            label="Tell us what happened"
            required
            hint="At least 20 characters. The other side does not see this text."
            error={fieldErrors.description}
          >
            {(field) => (
              <Textarea
                {...field}
                rows={4}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </FormField>
          {error && (
            <p className="text-sm text-danger-700" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive-solid"
            onClick={submit}
            disabled={!reason}
            loading={pending}
            loadingText="Sending…"
          >
            Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
