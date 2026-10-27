'use client'

import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api-client'

type Status = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'

/** Resolve, close or reopen a help request (audited on the server). */
export function TicketStatusButtons({ ticketId, status }: { ticketId: string; status: Status }) {
  const { pending, error, run } = useApiAction()
  const set = (to: 'OPEN' | 'RESOLVED' | 'CLOSED', success: string) =>
    run(
      () =>
        apiFetch(`/api/v1/admin/support/tickets/${ticketId}`, {
          method: 'PATCH',
          body: { status: to },
        }),
      { success },
    )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {(status === 'OPEN' || status === 'IN_PROGRESS') && (
          <Button size="sm" disabled={pending} onClick={() => set('RESOLVED', 'Marked resolved')}>
            Mark resolved
          </Button>
        )}
        {status !== 'CLOSED' && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => set('CLOSED', 'Request closed')}
          >
            Close
          </Button>
        )}
        {(status === 'RESOLVED' || status === 'CLOSED') && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => set('OPEN', 'Request reopened')}
          >
            Reopen
          </Button>
        )}
      </div>
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
