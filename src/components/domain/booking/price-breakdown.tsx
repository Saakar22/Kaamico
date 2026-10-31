import { Badge } from '@/components/ui/badge'
import { Money } from '@/components/ui/money'
import { getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import type { ChargeView } from '@/modules/bookings/views'

const CHARGE_STATUS: Record<
  string,
  { label: MessageKey; tone: 'warning' | 'success' | 'neutral' }
> = {
  PROPOSED: { label: 'price.chargeProposed', tone: 'warning' },
  APPROVED: { label: 'price.chargeApproved', tone: 'success' },
  REJECTED: { label: 'price.chargeRejected', tone: 'neutral' },
}

/** Agreed price, every extra charge with its status, and what is payable. */
export async function PriceBreakdown({
  price,
  charges,
}: {
  price: { listedPaise: number | null; agreedPaise: number | null; totalPaise: number | null }
  charges: ChargeView[]
}) {
  const t = await getT()
  const base = price.agreedPaise ?? price.listedPaise
  return (
    <section aria-labelledby="price-title" className="flex flex-col gap-2">
      <h2 id="price-title" className="font-semibold">
        {t('price.title')}
      </h2>
      <dl className="flex flex-col gap-2 text-sm">
        {base !== null && (
          <div className="flex justify-between gap-3">
            <dt>{price.agreedPaise !== null ? t('price.agreed') : t('price.listed')}</dt>
            <dd>
              <Money paise={base} />
            </dd>
          </div>
        )}
        {charges.map((c) => (
          <div key={c.id} className="flex justify-between gap-3">
            <dt className="flex flex-col items-start gap-1">
              <span className={c.status === 'REJECTED' ? 'text-ink-600 line-through' : undefined}>
                {c.description}
              </span>
              <Badge tone={CHARGE_STATUS[c.status]?.tone ?? 'neutral'}>
                {CHARGE_STATUS[c.status] ? t(CHARGE_STATUS[c.status].label) : c.status}
              </Badge>
            </dt>
            <dd className={c.status === 'REJECTED' ? 'text-ink-600 line-through' : undefined}>
              + <Money paise={c.amountPaise} />
            </dd>
          </div>
        ))}
        {price.totalPaise !== null && (
          <div className="flex justify-between gap-3 border-t border-border pt-2 text-base font-semibold">
            <dt>{t('price.total')}</dt>
            <dd>
              <Money paise={price.totalPaise} />
            </dd>
          </div>
        )}
      </dl>
      {price.agreedPaise !== null && (
        <p className="text-xs text-ink-600">{t('price.lockedNote')}</p>
      )}
    </section>
  )
}
