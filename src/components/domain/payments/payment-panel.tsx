'use client'

import { Banknote, CircleCheck, CreditCard, ReceiptText, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { SimulationBadge } from '@/components/domain/trust-badges'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/ui/money'
import { apiFetch } from '@/lib/api-client'
import type { BookingPayment } from '@/modules/payments/payments'
import { RazorpayButton } from './razorpay-button'

/**
 * Paying for a completed job (§4 step 11): cash to the professional, or online, either
 * through a clearly labelled simulated checkout or Razorpay in test mode (`online`).
 * The server sets the amount.
 */
export function PaymentPanel({
  bookingId,
  totalPaise,
  workerName,
  state,
  online = 'SIMULATED',
  visitFee = false,
}: {
  bookingId: string
  totalPaise: number
  workerName: string
  state: BookingPayment
  online?: 'SIMULATED' | 'RAZORPAY'
  /** The amount is the visit fee for cancelling after the professional set off. */
  visitFee?: boolean
}) {
  const { pending, error, run } = useApiAction()
  // One key per attempt: a double tap cannot start two payments.
  const [key, setKey] = useState(() => crypto.randomUUID())

  const start = (method: 'CASH' | 'SIMULATED') =>
    run(async () => {
      await apiFetch(`/api/v1/bookings/${bookingId}/payments`, {
        body: { method },
        idempotencyKey: key,
      })
      setKey(crypto.randomUUID())
    })
  const simulate = (outcome: 'success' | 'failure') =>
    run(() => apiFetch(`/api/v1/payments/${state.payment!.id}/simulate`, { body: { outcome } }), {
      success: outcome === 'success' ? 'Payment successful' : undefined,
    })

  const amount = <Money paise={totalPaise} />

  if (state.state === 'PAID' && state.payment) {
    return (
      <section
        aria-labelledby="payment-title"
        className="flex flex-col gap-2 rounded-lg border border-success-700/30 bg-success-700/10 p-4"
      >
        <h2 id="payment-title" className="flex flex-wrap items-center gap-2 font-semibold">
          <CircleCheck aria-hidden="true" className="size-5 text-success-800" />
          Paid <Money paise={state.payment.amountPaise} />{' '}
          {state.payment.provider === 'CASH' ? 'in cash' : 'online'}
          {state.payment.simulated && <SimulationBadge label="Simulated: no money moved" />}
          {state.payment.provider === 'RAZORPAY' && (
            <SimulationBadge label="Razorpay test mode: no real money" />
          )}
        </h2>
        {state.receiptNumber && (
          <Link
            href={`/bookings/${bookingId}/receipt`}
            className="inline-flex h-11 w-fit items-center gap-2 text-sm font-medium text-brand-700 hover:underline"
          >
            <ReceiptText aria-hidden="true" className="size-4" />
            Receipt {state.receiptNumber}
          </Link>
        )}
      </section>
    )
  }

  return (
    <section
      aria-labelledby="payment-title"
      className="flex flex-col gap-3 rounded-lg border border-accent-500 bg-surface p-4"
    >
      <h2 id="payment-title" className="text-lg font-semibold">
        {state.state === 'AWAITING_CASH' ? <>Pay {amount} in cash</> : <>Pay {amount}</>}
        {visitFee && ' visit fee'}
      </h2>

      {state.state === 'AWAITING_CASH' && (
        <>
          <p>
            Hand {amount} to {workerName}. They confirm in their app and your receipt appears here.
          </p>
          {online === 'RAZORPAY' ? (
            <RazorpayButton bookingId={bookingId} variant="tertiary" className="self-start">
              Pay online instead
            </RazorpayButton>
          ) : (
            <Button
              variant="tertiary"
              className="self-start"
              onClick={() => start('SIMULATED')}
              disabled={pending}
            >
              <CreditCard aria-hidden="true" />
              Pay online instead
            </Button>
          )}
        </>
      )}

      {state.state === 'AWAITING_ONLINE' && (
        <div className="flex flex-col gap-3">
          <p>Your online payment is not finished yet.</p>
          <div className="flex flex-wrap gap-2">
            <RazorpayButton bookingId={bookingId}>Continue to payment</RazorpayButton>
            <Button variant="tertiary" onClick={() => start('CASH')} disabled={pending}>
              <Banknote aria-hidden="true" />
              Pay in cash instead
            </Button>
          </div>
          <p className="flex items-center gap-2 text-xs text-ink-600">
            <SimulationBadge label="Test mode" /> Razorpay test mode: use a test card or UPI ID.
          </p>
        </div>
      )}

      {state.state === 'AWAITING_SIMULATED' && (
        <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            Online checkout <SimulationBadge label="Simulation: no money moves" />
          </p>
          <p className="text-sm text-ink-600">
            Real online payments (UPI and cards) arrive later. Choose how this practice payment
            ends.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => simulate('success')} loading={pending} loadingText="Paying…">
              Pay {amount} (simulated)
            </Button>
            <Button variant="secondary" onClick={() => simulate('failure')} disabled={pending}>
              <X aria-hidden="true" />
              Simulate a failed payment
            </Button>
          </div>
          <Button
            variant="tertiary"
            className="self-start"
            onClick={() => start('CASH')}
            disabled={pending}
          >
            <Banknote aria-hidden="true" />
            Pay in cash instead
          </Button>
        </div>
      )}

      {state.state === 'UNPAID' && (
        <>
          {state.lastFailure && (
            <p
              role="alert"
              className="rounded-md bg-danger-700/10 px-3 py-2 text-sm text-danger-700"
            >
              {state.lastFailure}. Try again or pay in cash.
            </p>
          )}
          <p className="text-ink-600">
            {visitFee
              ? `You cancelled after ${workerName} had set off, so a visit fee covers their trip.`
              : 'The price was agreed before the job and cannot change now.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => start('CASH')} loading={pending} loadingText="One moment…">
              <Banknote aria-hidden="true" />
              Pay in cash
            </Button>
            {online === 'RAZORPAY' ? (
              <RazorpayButton bookingId={bookingId} variant="secondary" disabled={pending}>
                Pay online (UPI or card)
              </RazorpayButton>
            ) : (
              <Button variant="secondary" onClick={() => start('SIMULATED')} disabled={pending}>
                <CreditCard aria-hidden="true" />
                Pay online
              </Button>
            )}
          </div>
          {online === 'RAZORPAY' ? (
            <p className="flex items-center gap-2 text-xs text-ink-600">
              <SimulationBadge label="Test mode" /> Razorpay test mode: no real money moves.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-xs text-ink-600">
              <SimulationBadge /> Online payments are simulated in this demo.
            </p>
          )}
        </>
      )}

      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
