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
import { MoneyInput } from '@/components/ui/money-input'
import { apiFetch } from '@/lib/api-client'
import { formatINR } from '@/lib/money'

/** Refund part or all of a captured payment outside a reported problem (audited). */
export function RefundDialog({
  paymentId,
  bookingCode,
  refundablePaise,
}: {
  paymentId: string
  bookingCode: string
  refundablePaise: number
}) {
  const { pending, error, fieldErrors, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState<number | null>(refundablePaise)
  const [reason, setReason] = useState('')
  const [key, setKey] = useState(() => crypto.randomUUID())

  const confirm = () =>
    run(
      async () => {
        await apiFetch(`/api/v1/admin/payments/${paymentId}/refunds`, {
          body: { amountPaise: amount ?? 0, reason },
          idempotencyKey: key,
        })
        setOpen(false)
        setReason('')
        setKey(crypto.randomUUID())
      },
      { success: 'Refund recorded' },
    )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Refund
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund {bookingCode}?</DialogTitle>
          <DialogDescription>
            Up to {formatINR(refundablePaise)} can be refunded. The professional&apos;s earnings and
            Kaamico&apos;s fee are adjusted in the same step. Online payments are simulated in this
            release, so no money moves.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FormField label="Amount" required error={fieldErrors.amountPaise}>
            {(field) => (
              <MoneyInput {...field} value={amount} onValueChange={setAmount} className="sm:w-48" />
            )}
          </FormField>
          <FormField
            label="Reason"
            required
            hint="At least 10 characters. Recorded in the audit log."
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
            onClick={confirm}
            disabled={!amount}
            loading={pending}
            loadingText="Refunding…"
          >
            Refund {amount ? formatINR(amount) : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
