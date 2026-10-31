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
      <h2 id="price-title" className="font-display text-lg font-semibold">
        {t('price.title')}
      </h2>
      <dl className="flex flex-col gap-2 text-sm">
        {base !== null && (
          <div className="flex items-baseline gap-2">
            {/* The dotted leader sits inside the term so the list stays valid dt/dd pairs. */}
            <dt className="flex flex-1 items-baseline gap-2">
              {price.agreedPaise !== null ? t('price.agreed') : t('price.listed')}
              <span aria-hidden="true" className="leader" />
            </dt>
            <dd className="tabular-nums">
              <Money paise={base} />
            </dd>
          </div>
        )}
        {charges.map((c) => (
          <div key={c.id} className="flex items-start justify-between gap-3">
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
          <div className="mt-1 flex items-baseline justify-between gap-3 border-t-2 border-ink-900 pt-2">
            <dt className="font-semibold">{t('price.total')}</dt>
            <dd className="font-display text-2xl font-semibold">
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
