'use client'

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
import { Textarea } from '@/components/ui/input'
import { apiFetch } from '@/lib/api-client'

/** Cancel with a confirmation step; the server applies the policy (§11.3). */
export function CancelBookingButton({
  bookingId,
  version,
  label = 'Cancel request',
  description,
  reasonRequired = false,
}: {
  bookingId: string
  version: number
  label?: string
  description: string
  reasonRequired?: boolean
}) {
  const { pending, error, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  const confirm = () =>
    run(
      async () => {
        await apiFetch(`/api/v1/bookings/${bookingId}/cancel`, {
          body: { reason: reason || undefined, expectedVersion: version },
        })
        setOpen(false)
      },
      { success: 'Cancelled' },
    )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}?</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <FormField
          label={reasonRequired ? 'Reason' : 'Reason (optional)'}
          required={reasonRequired}
        >
          {(field) => (
            <Textarea
              {...field}
              rows={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </FormField>
        {error && (
          <p className="text-sm text-danger-700" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Keep it</Button>
          </DialogClose>
          <Button
            variant="destructive-solid"
            onClick={confirm}
            loading={pending}
            loadingText="Cancelling…"
            disabled={reasonRequired && !reason.trim()}
          >
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
