import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PrintButton } from '@/components/domain/payments/print-button'
import { SimulationBadge } from '@/components/domain/trust-badges'
import { Logo } from '@/components/brand/logo'
import { Card, CardContent } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { htmlLang } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import { AppError } from '@/lib/errors'
import { formatIstDateTime } from '@/lib/time'
import { requirePageActor } from '@/modules/auth/page-guards'
import type { Actor } from '@/modules/auth/types'
import { getReceipt } from '@/modules/payments/receipts'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('receipt.metaTitle') }
}

async function load(actor: Actor, id: string) {
  try {
    return await getReceipt(actor, id)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

/** Printable booking receipt (§10.11). Not a GST tax invoice. */
export default async function ReceiptPage({ params }: PageProps<'/[lang]/bookings/[id]/receipt'>) {
  const actor = await requirePageActor()
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const lang = htmlLang[locale]
  const r = await load(actor, (await params).id)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      <Card>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <Logo />
            <div className="text-right text-sm">
              <h1 className="font-display text-xl font-semibold">{t('receipt.title')}</h1>
              <p className="font-mono">{r.number}</p>
              <p className="text-ink-600">{formatIstDateTime(new Date(r.issuedAt), lang)}</p>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-600">{t('receipt.booking')}</dt>
            <dd>
              {r.bookingCode} · {r.serviceName}
            </dd>
            <dt className="text-ink-600">{t('receipt.customer')}</dt>
            <dd>{r.customerName}</dd>
            <dt className="text-ink-600">{t('receipt.professional')}</dt>
            <dd>{r.workerName}</dd>
            <dt className="text-ink-600">{t('receipt.area')}</dt>
            <dd>{r.locality}</dd>
            {r.completedAt && (
              <>
                <dt className="text-ink-600">{t('receipt.completed')}</dt>
                <dd>{formatIstDateTime(new Date(r.completedAt), lang)}</dd>
              </>
            )}
          </dl>
          <table className="w-full text-sm">
            <caption className="sr-only">{t('receipt.charges')}</caption>
            <thead>
              <tr className="border-b border-border text-left text-ink-600">
                <th scope="col" className="py-2 font-medium">
                  {t('receipt.item')}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t('receipt.amount')}
                </th>
              </tr>
            </thead>
            <tbody>
              {r.lineItems.map((item, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="py-2">{item.label}</td>
                  <td className="py-2 text-right">
                    <Money paise={item.amountPaise} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-base font-semibold">
                <th scope="row" className="py-2 text-left">
                  {t('receipt.total')}
                </th>
                <td className="py-2 text-right">
                  <Money paise={r.totalPaise} />
                </td>
              </tr>
              {r.platformFeePaise !== null && (
                <tr className="text-ink-600">
                  <th scope="row" className="py-1 text-left font-normal">
                    {t('receipt.fee')}
                  </th>
                  <td className="py-1 text-right">
                    <Money paise={r.platformFeePaise} />
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            {t('receipt.paidWith', { method: r.paidWith })}
            {r.simulated && <SimulationBadge label={t('receipt.simulated')} />}
          </p>
          <p className="text-xs text-ink-600">{t('receipt.notGst')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
