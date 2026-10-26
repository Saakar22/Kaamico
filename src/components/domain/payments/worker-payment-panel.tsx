'use client'

import { Banknote, CircleCheck, Clock } from 'lucide-react'
import Link from 'next/link'
import { SimulationBadge } from '@/components/domain/trust-badges'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/ui/money'
import { apiFetch } from '@/lib/api-client'
import type { BookingPayment } from '@/modules/payments/payments'

/** Payment status on a completed job, with the cash confirmation and what the job earned. */
export function WorkerPaymentPanel({
  bookingId,
  customerName,
  totalPaise,
  feePaise,
  state,
}: {
  bookingId: string
  customerName: string
  totalPaise: number
  feePaise: number
  state: BookingPayment
}) {
  const { pending, error, run } = useApiAction()
  const confirm = () =>
    run(() => apiFetch(`/api/v1/payments/${state.payment!.id}/confirm-cash`, { body: {} }), {
      success: 'Cash payment confirmed',
    })

  return (
    <section
      aria-labelledby="pay-title"
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <h2 id="pay-title" className="font-semibold">
        Payment
      </h2>
      {state.state === 'PAID' && state.payment ? (
        <p className="flex flex-wrap items-center gap-2">
          <CircleCheck aria-hidden="true" className="size-5 text-success-800" />
          {customerName} paid <Money paise={state.payment.amountPaise} />{' '}
          {state.payment.provider === 'CASH' ? 'in cash' : 'online'}
          {state.payment.simulated && <SimulationBadge />}
        </p>
      ) : state.state === 'AWAITING_CASH' ? (
        <div className="flex flex-col gap-2">
          <p>
            {customerName} is paying <Money paise={totalPaise} /> in cash. Confirm once it is in
            your hands.
          </p>
          <Button
            className="self-start"
            onClick={confirm}
            loading={pending}
            loadingText="Confirming…"
          >
            <Banknote aria-hidden="true" />
            I received <Money paise={totalPaise} />
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-ink-600">
          <Clock aria-hidden="true" className="size-4" />
          Waiting for {customerName} to pay <Money paise={totalPaise} />.
        </p>
      )}
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border pt-3 text-sm">
        <dt>Job total</dt>
        <dd className="text-right">
          <Money paise={totalPaise} />
        </dd>
        <dt>Kaamico fee</dt>
        <dd className="text-right">
          − <Money paise={feePaise} />
        </dd>
        <dt className="font-semibold">You earn</dt>
        <dd className="text-right font-semibold">
          <Money paise={totalPaise - feePaise} />
        </dd>
      </dl>
      <p className="text-xs text-ink-600">
        For cash jobs you keep the cash; the fee is taken from your next online earnings.{' '}
        <Link href="/worker/earnings" className="font-medium text-brand-700 hover:underline">
          Your earnings
        </Link>
        {state.receiptNumber && (
          <>
            {' · '}
            <Link
              href={`/bookings/${bookingId}/receipt`}
              className="font-medium text-brand-700 hover:underline"
            >
              Receipt
            </Link>
          </>
        )}
      </p>
    </section>
  )
}
