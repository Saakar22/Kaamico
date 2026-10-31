'use client'

import { Banknote, CircleCheck, CreditCard, ReceiptText, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { SimulationBadge } from '@/components/domain/trust-badges'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/ui/money'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'
import type { BookingPayment } from '@/modules/payments/payments'
import { RazorpayButton } from './razorpay-button'
import { formatINR } from '@/lib/money'

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
  const t = useT()
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
      success: outcome === 'success' ? t('pay.success') : undefined,
    })

  const rupees = formatINR(totalPaise)

  if (state.state === 'PAID' && state.payment) {
    return (
      <section
        aria-labelledby="payment-title"
        className="flex flex-col gap-2 rounded-md border border-success-700/30 bg-success-700/10 p-4"
      >
        <h2 id="payment-title" className="flex flex-wrap items-center gap-2 font-semibold">
          <CircleCheck aria-hidden="true" className="size-5 text-success-800" />
          {t('pay.paid')} <Money paise={state.payment.amountPaise} />{' '}
          {state.payment.provider === 'CASH' ? t('pay.inCash') : t('pay.online')}
          {state.payment.simulated && <SimulationBadge label={t('pay.simulatedBadge')} />}
          {state.payment.provider === 'RAZORPAY' && (
            <SimulationBadge label={t('pay.testModeBadge')} />
          )}
        </h2>
        {state.receiptNumber && (
          <Link
            href={`/bookings/${bookingId}/receipt`}
            className="inline-flex h-11 w-fit items-center gap-2 text-sm font-medium text-brand-700 hover:underline"
          >
            <ReceiptText aria-hidden="true" className="size-4" />
            {t('pay.receipt', { number: state.receiptNumber })}
          </Link>
        )}
      </section>
    )
  }

  return (
    <section
      aria-labelledby="payment-title"
      className="flex flex-col gap-3 rounded-md border border-accent-500 bg-surface p-4"
    >
      <h2 id="payment-title" className="text-lg font-semibold">
        {state.state === 'AWAITING_CASH'
          ? t('pay.payInCash', { amount: rupees })
          : t('pay.pay', { amount: rupees })}
        {visitFee && t('pay.visitFeeSuffix')}
      </h2>

      {state.state === 'AWAITING_CASH' && (
        <>
          <p>{t('pay.handCash', { amount: rupees, name: workerName })}</p>
          {online === 'RAZORPAY' ? (
            <RazorpayButton bookingId={bookingId} variant="tertiary" className="self-start">
              {t('pay.payOnlineInstead')}
            </RazorpayButton>
          ) : (
            <Button
              variant="tertiary"
              className="self-start"
              onClick={() => start('SIMULATED')}
              disabled={pending}
            >
              <CreditCard aria-hidden="true" />
              {t('pay.payOnlineInstead')}
            </Button>
          )}
        </>
      )}

      {state.state === 'AWAITING_ONLINE' && (
        <div className="flex flex-col gap-3">
          <p>{t('pay.notFinished')}</p>
          <div className="flex flex-wrap gap-2">
            <RazorpayButton bookingId={bookingId}>{t('pay.continue')}</RazorpayButton>
            <Button variant="tertiary" onClick={() => start('CASH')} disabled={pending}>
              <Banknote aria-hidden="true" />
              {t('pay.cashInstead')}
            </Button>
          </div>
          <p className="flex items-center gap-2 text-xs text-ink-600">
            <SimulationBadge label={t('pay.testMode')} /> {t('pay.testModeHint')}
          </p>
        </div>
      )}

      {state.state === 'AWAITING_SIMULATED' && (
        <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {t('pay.checkout')} <SimulationBadge label={t('pay.simulation')} />
          </p>
          <p className="text-sm text-ink-600">{t('pay.simulationHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => simulate('success')}
              loading={pending}
              loadingText={t('pay.paying')}
            >
              {t('pay.paySimulated', { amount: rupees })}
            </Button>
            <Button variant="secondary" onClick={() => simulate('failure')} disabled={pending}>
              <X aria-hidden="true" />
              {t('pay.simulateFail')}
            </Button>
          </div>
          <Button
            variant="tertiary"
            className="self-start"
            onClick={() => start('CASH')}
            disabled={pending}
          >
            <Banknote aria-hidden="true" />
            {t('pay.cashInstead')}
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
              {t('pay.lastFailure', { reason: state.lastFailure })}
            </p>
          )}
          <p className="text-ink-600">
            {visitFee ? t('pay.visitFeeNote', { name: workerName }) : t('pay.lockedNote')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => start('CASH')}
              loading={pending}
              loadingText={t('pay.oneMoment')}
            >
              <Banknote aria-hidden="true" />
              {t('pay.cash')}
            </Button>
            {online === 'RAZORPAY' ? (
              <RazorpayButton bookingId={bookingId} variant="secondary" disabled={pending}>
                {t('pay.payOnlineUpi')}
              </RazorpayButton>
            ) : (
              <Button variant="secondary" onClick={() => start('SIMULATED')} disabled={pending}>
                <CreditCard aria-hidden="true" />
                {t('pay.payOnline')}
              </Button>
            )}
          </div>
          {online === 'RAZORPAY' ? (
            <p className="flex items-center gap-2 text-xs text-ink-600">
              <SimulationBadge label={t('pay.testMode')} /> {t('pay.testNoMoney')}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-xs text-ink-600">
              <SimulationBadge /> {t('pay.simulatedNote')}
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
