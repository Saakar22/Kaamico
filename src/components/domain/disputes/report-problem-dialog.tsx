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
import { useLocale, useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'
import { DISPUTE_REASONS, disputeReasonLabel, type DisputeReason } from '@/modules/disputes/labels'

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
  const t = useT()
  const locale = useLocale()
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
      { success: t('dispute.thanks') },
    )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <TriangleAlert aria-hidden="true" />
          {safetyOnly ? t('dispute.reportSafety') : t('dispute.report')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{safetyOnly ? t('dispute.reportSafety') : t('dispute.report')}</DialogTitle>
          <DialogDescription>{t('dispute.reportBody')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FormField label={t('dispute.what')} required error={fieldErrors.reason}>
            {(field) => (
              <NativeSelect
                {...field}
                value={reason}
                onChange={(e) => setReason(e.target.value as DisputeReason)}
              >
                {!safetyOnly && <option value="">{t('dispute.chooseOne')}</option>}
                {reasons.map((r) => (
                  <option key={r} value={r}>
                    {disputeReasonLabel(r, locale)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            label={t('dispute.tell')}
            required
            hint={t('dispute.tellHint')}
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
            <Button variant="secondary">{t('dispute.cancel')}</Button>
          </DialogClose>
          <Button
            variant="destructive-solid"
            onClick={submit}
            disabled={!reason}
            loading={pending}
            loadingText={t('dispute.sending')}
          >
            {t('dispute.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
