'use client'

import { Banknote, CircleCheck, Clock } from 'lucide-react'
import Link from 'next/link'
import { SimulationBadge } from '@/components/domain/trust-badges'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/ui/money'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'
import { formatINR } from '@/lib/money'
import type { BookingPayment } from '@/modules/payments/payments'

/** Payment status on a completed job, with the cash confirmation and what the job earned. */
export function WorkerPaymentPanel({
  bookingId,
  customerName,
  totalPaise,
  feePaise,
  state,
  visitFee = false,
}: {
  bookingId: string
  customerName: string
  totalPaise: number
  feePaise: number
  state: BookingPayment
  /** The customer cancelled after you set off and owes the visit fee. */
  visitFee?: boolean
}) {
  const t = useT()
  const { pending, error, run } = useApiAction()
  const confirm = () =>
    run(() => apiFetch(`/api/v1/payments/${state.payment!.id}/confirm-cash`, { body: {} }), {
      success: t('wpay.confirmed'),
    })

  return (
    <section
      aria-labelledby="pay-title"
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <h2 id="pay-title" className="font-semibold">
        {visitFee ? t('wpay.visitFee') : t('wpay.payment')}
      </h2>
      {visitFee && (
        <p className="text-sm text-ink-600">{t('wpay.visitFeeNote', { name: customerName })}</p>
      )}
      {state.state === 'PAID' && state.payment ? (
        <p className="flex flex-wrap items-center gap-2">
          <CircleCheck aria-hidden="true" className="size-5 text-success-800" />
          {t('wpay.paid', {
            name: customerName,
            amount: formatINR(state.payment.amountPaise),
            how: state.payment.provider === 'CASH' ? t('wpay.inCash') : t('wpay.online'),
          })}
          {state.payment.simulated && <SimulationBadge />}
        </p>
      ) : state.state === 'AWAITING_CASH' ? (
        <div className="flex flex-col gap-2">
          <p>{t('wpay.payingCash', { name: customerName, amount: formatINR(totalPaise) })}</p>
          <Button
            className="self-start"
            onClick={confirm}
            loading={pending}
            loadingText={t('wpay.confirming')}
          >
            <Banknote aria-hidden="true" />
            {t('wpay.received', { amount: formatINR(totalPaise) })}
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-ink-600">
          <Clock aria-hidden="true" className="size-4" />
          {t('wpay.waiting', { name: customerName, amount: formatINR(totalPaise) })}
        </p>
      )}
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border pt-3 text-sm">
        <dt>{visitFee ? t('wpay.visitFee') : t('wpay.jobTotal')}</dt>
        <dd className="text-right">
          <Money paise={totalPaise} />
        </dd>
        <dt>{t('wpay.fee')}</dt>
        <dd className="text-right">
          − <Money paise={feePaise} />
        </dd>
        <dt className="font-semibold">{t('wpay.youEarn')}</dt>
        <dd className="text-right font-semibold">
          <Money paise={totalPaise - feePaise} />
        </dd>
      </dl>
      <p className="text-xs text-ink-600">
        {t('wpay.cashNote')}{' '}
        <Link href="/worker/earnings" className="font-medium text-brand-700 hover:underline">
          {t('wpay.earnings')}
        </Link>
        {state.receiptNumber && (
          <>
            {' · '}
            <Link
              href={`/bookings/${bookingId}/receipt`}
              className="font-medium text-brand-700 hover:underline"
            >
              {t('wpay.receipt')}
            </Link>
          </>
        )}
      </p>
    </section>
  )
}
