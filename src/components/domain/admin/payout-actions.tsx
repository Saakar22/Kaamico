'use client'

import { ReasonActionDialog } from '@/components/domain/admin/reason-action-dialog'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api-client'

/** Move a payout on: processing, paid, or failed with a reason (audited on the server). */
export function PayoutActions({
  payoutId,
  status,
  workerName,
}: {
  payoutId: string
  status: 'REQUESTED' | 'PROCESSING'
  workerName: string
}) {
  const { pending, error, run } = useApiAction()
  const endpoint = `/api/v1/admin/payouts/${payoutId}/status`
  const set = (to: 'PROCESSING' | 'PAID', success: string) =>
    run(() => apiFetch(endpoint, { body: { status: to } }), { success })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === 'REQUESTED' && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => set('PROCESSING', 'Marked as processing')}
          >
            Start
          </Button>
        )}
        <Button size="sm" disabled={pending} onClick={() => set('PAID', 'Marked as paid')}>
          Mark paid
        </Button>
        <ReasonActionDialog
          label="Mark failed"
          title={`Payout to ${workerName} failed?`}
          description="The amount goes back to their balance and they are told why."
          endpoint={endpoint}
          body={{ status: 'FAILED' }}
          reasonHint="At least 10 characters. Shown to the professional and recorded in the audit log."
          success="Marked as failed"
          size="sm"
        />
      </div>
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
