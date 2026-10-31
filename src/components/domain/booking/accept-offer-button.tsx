'use client'

import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'

/** Accepts a professional's offer; confirms the booking at that price. */
export function AcceptOfferButton({
  offerId,
  bookingId,
  version,
  children,
}: {
  offerId: string
  bookingId: string
  version: number
  children: ReactNode
}) {
  const router = useRouter()
  const t = useT()
  const { pending, error, run } = useApiAction()
  const [key] = useState(() => crypto.randomUUID())

  const accept = () =>
    run(
      async () => {
        await apiFetch(`/api/v1/offers/${offerId}/accept`, {
          body: { expectedBookingVersion: version },
          idempotencyKey: key,
        })
        router.push(`/bookings/${bookingId}?confirmed=1`)
      },
      { refresh: false },
    )

  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" onClick={accept} loading={pending} loadingText={t('cancel.booking')}>
        {children}
      </Button>
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
