'use client'

import { Clock, Flag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Money } from '@/components/ui/money'
import { useLocale, useT } from '@/i18n/client'
import { htmlLang } from '@/i18n/config'
import type { MessageKey } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import { formatIstTime } from '@/lib/time'
import type { OfferView } from '@/modules/bookings/views'

const STATUS_LABEL: Record<
  string,
  { label: MessageKey; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'brand' }
> = {
  PENDING: { label: 'offer.pending', tone: 'warning' },
  ACCEPTED: { label: 'offer.accepted', tone: 'success' },
  COUNTERED: { label: 'offer.countered', tone: 'neutral' },
  REJECTED: { label: 'offer.rejected', tone: 'danger' },
  EXPIRED: { label: 'offer.expired', tone: 'neutral' },
  WITHDRAWN: { label: 'offer.withdrawn', tone: 'neutral' },
  SUPERSEDED: { label: 'offer.superseded', tone: 'neutral' },
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
  const t = useT()
  const lang = htmlLang[useLocale()]
  const known = STATUS_LABEL[offer.status]
  const status = known
    ? { label: t(known.label), tone: known.tone }
    : { label: offer.status, tone: 'neutral' as const }
  const aboveListed =
    listedPaise && offer.offeredBy === 'WORKER' && offer.amountPaise > listedPaise
      ? Math.round(((offer.amountPaise - listedPaise) / listedPaise) * 100)
      : null
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'flex w-full max-w-sm flex-col gap-1.5 rounded-md border p-3',
          mine ? 'border-brand-600/30 bg-brand-50' : 'border-border bg-surface',
          offer.status === 'ACCEPTED' && 'border-success-700/40',
        )}
      >
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">
            {mine ? t('offer.yours') : t('offer.theirs', { name: authorName })}
          </span>
          <span className="text-ink-600">{formatIstTime(new Date(offer.createdAt), lang)}</span>
        </div>
        <Money paise={offer.amountPaise} className="text-2xl font-bold" />
        {aboveListed !== null && aboveListed > 0 && (
          <span className="text-sm text-warning-800">
            {t('offer.aboveListed', { percent: aboveListed })}
          </span>
        )}
        {offer.note && <p className="text-sm text-ink-900">“{offer.note}”</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {offer.isFinal && (
            <Badge tone="info">
              <Flag aria-hidden="true" />
              {t('offer.final')}
            </Badge>
          )}
          {offer.status === 'PENDING' && (
            <span className="flex items-center gap-1 text-xs text-ink-600">
              <Clock aria-hidden="true" className="size-3.5" />
              {t('offer.expires', { time: formatIstTime(new Date(offer.expiresAt), lang) })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
