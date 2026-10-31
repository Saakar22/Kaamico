'use client'

import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Money } from '@/components/ui/money'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'
import type { ChargeView } from '@/modules/bookings/views'

/**
 * Opens by itself when the professional proposes an extra charge (§4 step 10): the
 * customer sees the new total before deciding. Closing it leaves the charge pending.
 */
export function ChargeApprovalDialog({
  charge,
  currentTotalPaise,
  workerName,
}: {
  charge: ChargeView
  currentTotalPaise: number
  workerName: string
}) {
  const t = useT()
  const [open, setOpen] = useState(true)
  const { pending, error, run } = useApiAction()
  const decide = (decision: 'approve' | 'reject') =>
    run(
      async () => {
        await apiFetch(`/api/v1/charges/${charge.id}/${decision}`, { body: {} })
        setOpen(false)
      },
      { success: decision === 'approve' ? t('charge.approved') : t('charge.declined') },
    )

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('charge.added', { name: workerName })}</DialogTitle>
            <DialogDescription>{t('charge.onlyIfApproved')}</DialogDescription>
          </DialogHeader>
          <dl className="flex flex-col gap-2 rounded-md bg-surface-muted p-3">
            <div className="flex justify-between gap-3">
              <dt>{charge.description}</dt>
              <dd className="font-semibold">
                <Money paise={charge.amountPaise} />
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-2">
              <dt>{t('charge.newTotal')}</dt>
              <dd className="font-semibold">
                <Money paise={currentTotalPaise + charge.amountPaise} />
              </dd>
            </div>
          </dl>
          {error && (
            <p className="text-sm text-danger-700" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="destructive" onClick={() => decide('reject')} disabled={pending}>
              <X aria-hidden="true" />
              {t('charge.decline')}
            </Button>
            <Button
              onClick={() => decide('approve')}
              loading={pending}
              loadingText={t('charge.approving')}
            >
              <Check aria-hidden="true" />
              {t('charge.approve')} <Money paise={charge.amountPaise} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {!open && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning-700/30 bg-warning-700/10 p-3"
        >
          <span>
            {t('charge.waiting')} {charge.description}, <Money paise={charge.amountPaise} />
          </span>
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            {t('charge.review')}
          </Button>
        </div>
      )}
    </>
  )
}
