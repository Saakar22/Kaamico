import { Clock, Flag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Money } from '@/components/ui/money'
import { cn } from '@/lib/cn'
import { formatIstTime } from '@/lib/time'
import type { OfferView } from '@/modules/bookings/views'

const STATUS_LABEL: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'brand' }
> = {
  PENDING: { label: 'Waiting for reply', tone: 'warning' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  COUNTERED: { label: 'Countered', tone: 'neutral' },
  REJECTED: { label: 'Declined', tone: 'danger' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
  SUPERSEDED: { label: 'Closed', tone: 'neutral' },
}

/** One offer in the thread: who offered what, when, and what happened to it. */
export function OfferCard({
  offer,
  mine,
  authorName,
  listedPaise,
}: {
  offer: OfferView
  mine: boolean
  authorName: string
  listedPaise: number | null
}) {
  const status = STATUS_LABEL[offer.status] ?? { label: offer.status, tone: 'neutral' as const }
  const aboveListed =
    listedPaise && offer.offeredBy === 'WORKER' && offer.amountPaise > listedPaise
      ? Math.round(((offer.amountPaise - listedPaise) / listedPaise) * 100)
      : null
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'flex w-full max-w-sm flex-col gap-1.5 rounded-lg border p-3',
          mine ? 'border-brand-600/30 bg-brand-50' : 'border-border bg-surface',
          offer.status === 'ACCEPTED' && 'border-success-700/40',
        )}
      >
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">{mine ? 'Your offer' : `${authorName}'s offer`}</span>
          <span className="text-ink-600">{formatIstTime(new Date(offer.createdAt))}</span>
        </div>
        <Money paise={offer.amountPaise} className="text-2xl font-bold" />
        {aboveListed !== null && aboveListed > 0 && (
          <span className="text-sm text-warning-800">+{aboveListed}% above listed price</span>
        )}
        {offer.note && <p className="text-sm text-ink-900">“{offer.note}”</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {offer.isFinal && (
            <Badge tone="info">
              <Flag aria-hidden="true" />
              Final offer
            </Badge>
          )}
          {offer.status === 'PENDING' && (
            <span className="flex items-center gap-1 text-xs text-ink-600">
              <Clock aria-hidden="true" className="size-3.5" />
              Expires {formatIstTime(new Date(offer.expiresAt))}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
