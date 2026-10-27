import { Zap } from 'lucide-react'
import { RatingSummary } from '@/components/domain/professionals/rating'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import type { QuickMatchCandidate } from '@/modules/bookings/views'
import { AcceptOfferButton } from './accept-offer-button'

const STATUS: Record<
  QuickMatchCandidate['status'],
  { label: string; tone: 'info' | 'warning' | 'neutral' | 'success' }
> = {
  WAITING: { label: 'Deciding', tone: 'info' },
  COUNTERED: { label: 'Suggested a price', tone: 'warning' },
  DECLINED: { label: 'Not available', tone: 'neutral' },
  EXPIRED: { label: 'No answer', tone: 'neutral' },
  WON: { label: 'Booked', tone: 'success' },
  LOST: { label: 'Not needed', tone: 'neutral' },
}

/**
 * An open quick match from the customer's side: who it went to, each one's price, and
 * any counteroffer to accept. The first professional to accept is booked automatically.
 */
export function QuickMatchPanel({
  bookingId,
  version,
  candidates,
}: {
  bookingId: string
  version: number
  candidates: QuickMatchCandidate[]
}) {
  const stillIn = candidates.filter((c) => c.status === 'WAITING' || c.status === 'COUNTERED')
  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Zap aria-hidden="true" className="size-5 text-accent-500" />
          Finding a professional
        </h2>
        <p className="text-sm text-ink-600" role="status">
          {stillIn.length > 0
            ? `Sent to ${candidates.length} nearby ${candidates.length === 1 ? 'professional' : 'professionals'} who are free now. The first to accept is booked at their price; you'll see it here.`
            : 'Nobody is left on this request. You can cancel it and try again or choose a professional yourself.'}
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
                    <span>{c.distanceKm.toFixed(1)} km away</span>
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">
                  <Money paise={c.pricePaise} className="font-semibold" />
                </span>
                <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                {c.acceptableOfferId && (
                  <AcceptOfferButton
                    offerId={c.acceptableOfferId}
                    bookingId={bookingId}
                    version={version}
                  >
                    Accept <Money paise={c.pricePaise} />
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
