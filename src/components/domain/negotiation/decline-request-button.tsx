'use client'

import { useRouter } from 'next/navigation'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api-client'

/** Turns a request down; the customer is told to choose someone else. */
export function DeclineRequestButton({ invitationId }: { invitationId: string }) {
  const router = useRouter()
  const { pending, error, run } = useApiAction()
  const decline = () =>
    run(
      async () => {
        await apiFetch(`/api/v1/worker/requests/${invitationId}/decline`, { body: {} })
        router.push('/worker/requests')
      },
      { success: 'Request declined', refresh: false },
    )
  return (
    <div className="flex flex-col gap-1">
      <Button variant="destructive" onClick={decline} loading={pending} loadingText="Declining…">
        Decline request
      </Button>
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
