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
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'

/** Cancel with a confirmation step; the server applies the policy (§11.3). */
export function CancelBookingButton({
  bookingId,
  version,
  label,
  description,
  reasonRequired = false,
}: {
  bookingId: string
  version: number
  label?: string
  description: string
  reasonRequired?: boolean
}) {
  const t = useT()
  const { pending, error, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const title = label ?? t('cancel.cancelRequest')
  const [reason, setReason] = useState('')

  const confirm = () =>
    run(
      async () => {
        await apiFetch(`/api/v1/bookings/${bookingId}/cancel`, {
          body: { reason: reason || undefined, expectedVersion: version },
        })
        setOpen(false)
      },
      { success: t('cancel.done') },
    )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">{title}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}?</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <FormField
          label={reasonRequired ? t('cancel.reason') : t('cancel.reasonOptional')}
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
            <Button variant="secondary">{t('cancel.keep')}</Button>
          </DialogClose>
          <Button
            variant="destructive-solid"
            onClick={confirm}
            loading={pending}
            loadingText={t('cancel.cancelling')}
            disabled={reasonRequired && !reason.trim()}
          >
            {title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
