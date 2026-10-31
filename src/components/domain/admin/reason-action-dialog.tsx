'use client'

import { useState } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button, type ButtonProps } from '@/components/ui/button'
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

const MIN_REASON = 10

/**
 * An admin action that needs a written reason (cancel a booking, suspend an account).
 * The reason is stored in the audit log and, where relevant, shown to the people affected.
 */
export function ReasonActionDialog({
  label,
  title,
  description,
  endpoint,
  method = 'POST',
  body,
  reasonLabel = 'Reason',
  reasonHint,
  success,
  variant = 'destructive',
  size,
}: {
  label: string
  title: string
  description: string
  endpoint: string
  method?: 'POST' | 'PATCH'
  body: Record<string, unknown>
  reasonLabel?: string
  reasonHint?: string
  success: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
}) {
  const { pending, error, fieldErrors, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const t = useT()
  const [reason, setReason] = useState('')

  const confirm = () =>
    run(
      async () => {
        await apiFetch(endpoint, { method, body: { ...body, reason } })
        setOpen(false)
        setReason('')
      },
      { success },
    )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <FormField
          label={reasonLabel}
          required
          hint={reasonHint ?? `At least ${MIN_REASON} characters. Recorded in the audit log.`}
          error={fieldErrors.reason}
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
        {error && !fieldErrors.reason && (
          <p className="text-sm text-danger-700" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{t('wreviews.back')}</Button>
          </DialogClose>
          <Button
            variant={variant === 'destructive' ? 'destructive-solid' : 'primary'}
            onClick={confirm}
            loading={pending}
            loadingText={t('wreviews.saving')}
            disabled={reason.trim().length < MIN_REASON}
          >
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
