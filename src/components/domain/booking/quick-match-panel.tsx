import { Zap } from 'lucide-react'
import { RatingSummary } from '@/components/domain/professionals/rating'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import type { QuickMatchCandidate } from '@/modules/bookings/views'
import { AcceptOfferButton } from './accept-offer-button'

const STATUS: Record<
  QuickMatchCandidate['status'],
  { label: MessageKey; tone: 'info' | 'warning' | 'neutral' | 'success' }
> = {
  WAITING: { label: 'quick.statusWaiting', tone: 'info' },
  COUNTERED: { label: 'quick.statusCountered', tone: 'warning' },
  DECLINED: { label: 'quick.statusDeclined', tone: 'neutral' },
  EXPIRED: { label: 'quick.statusExpired', tone: 'neutral' },
  WON: { label: 'quick.statusWon', tone: 'success' },
  LOST: { label: 'quick.statusLost', tone: 'neutral' },
}

/**
 * An open quick match from the customer's side: who it went to, each one's price, and
 * any counteroffer to accept. The first professional to accept is booked automatically.
 */
export async function QuickMatchPanel({
  bookingId,
  version,
  candidates,
}: {
  bookingId: string
  version: number
  candidates: QuickMatchCandidate[]
}) {
  const t = await getT()
  const stillIn = candidates.filter((c) => c.status === 'WAITING' || c.status === 'COUNTERED')
  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Zap aria-hidden="true" className="size-5 text-accent-500" />
          {t('quick.finding')}
        </h2>
        <p className="text-sm text-ink-600" role="status">
          {stillIn.length > 0
            ? t(candidates.length === 1 ? 'quick.sentToOne' : 'quick.sentToOther', {
                count: candidates.length,
              })
            : t('quick.nobodyLeft')}
        </p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border">
          {candidates.map((c) => (
            <li
              key={c.workerId}
              className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={c.displayName} src={c.photoUrl} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{c.displayName}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-sm text-ink-600">
                    <RatingSummary avg={c.rating.avg} count={c.rating.count} />
                    <span>{t('quick.kmAway', { km: c.distanceKm.toFixed(1) })}</span>
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">
                  <Money paise={c.pricePaise} className="font-semibold" />
                </span>
                <Badge tone={STATUS[c.status].tone}>{t(STATUS[c.status].label)}</Badge>
                {c.acceptableOfferId && (
                  <AcceptOfferButton
                    offerId={c.acceptableOfferId}
                    bookingId={bookingId}
                    version={version}
                  >
                    {t('quick.accept')} <Money paise={c.pricePaise} />
                  </AcceptOfferButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
