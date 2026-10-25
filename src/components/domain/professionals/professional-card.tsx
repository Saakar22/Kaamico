import { CalendarClock, Navigation, Sprout, Zap } from 'lucide-react'
import Link from 'next/link'
import { VerificationBadge } from '@/components/domain/trust-badges'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Money } from '@/components/ui/money'
import { formatIstDay, formatIstTime } from '@/lib/time'
import { unitSpoken, unitSuffix } from '@/modules/catalog/units'
import type { ProfessionalResult } from '@/modules/matching/search'
import { languageNames } from '@/modules/professionals/languages'
import { RatingSummary } from './rating'

const firstName = (name: string) => name.trim().split(/\s+/)[0]

/** "Next: Tomorrow, 10:00 am" */
export function nextSlotLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  return `${formatIstDay(date, now)}, ${formatIstTime(date)}`
}

/**
 * One search result. Every trust signal lives here so all lists show the same facts:
 * verification, rating with count, distance, the worker's own price and availability.
 */
export function ProfessionalCard({
  pro,
  serviceId,
  now,
}: {
  pro: ProfessionalResult
  serviceId: string
  now?: Date
}) {
  const href = `/professionals/${pro.workerId}?service=${serviceId}`
  return (
    <article className="relative flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-xs hover:border-brand-600 sm:flex-row sm:p-5">
      <div className="flex min-w-0 flex-1 gap-3">
        <Avatar name={pro.displayName} src={pro.photoUrl} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="text-lg leading-snug font-semibold">
            {/* The link covers the whole card; other content stays readable text. */}
            <Link href={href} className="after:absolute after:inset-0 after:rounded-lg">
              {pro.displayName}
            </Link>
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <VerificationBadge status="VERIFIED" />
            {pro.isNew && (
              <Badge tone="info">
                <Sprout aria-hidden="true" />
                New on Kaamico
              </Badge>
            )}
            <RatingSummary avg={pro.rating.avg} count={pro.rating.count} />
          </div>
          <p className="text-sm text-ink-600">
            {pro.distanceKm.toFixed(1)} km away
            {pro.completedJobs > 0 && <> · {pro.completedJobs} jobs done</>}
            {pro.yearsExperience > 0 && <> · {pro.yearsExperience} yrs experience</>}
          </p>
          {pro.languages.length > 0 && (
            <p className="text-sm text-ink-600">Speaks {languageNames(pro.languages)}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3 sm:w-56 sm:shrink-0 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
        <p data-testid="pro-price">
          <Money paise={pro.price.paise} className="text-xl font-bold" />{' '}
          <span className="text-ink-600" aria-hidden="true">
            {unitSuffix(pro.price.unit)}
          </span>
          <span className="sr-only">{unitSpoken(pro.price.unit)}</span>
        </p>
        <p className="text-sm text-ink-600">
          Price set by {firstName(pro.displayName)}
          {pro.price.negotiable ? ' · Open to offers' : ' · Fixed price'}
        </p>
        {pro.availability.now ? (
          <div className="flex flex-col gap-1">
            <Badge tone="success" className="w-fit">
              <Zap aria-hidden="true" />
              Available now
            </Badge>
            {pro.approxArrival && (
              <p className="flex items-center gap-1.5 text-sm text-ink-600">
                <Navigation aria-hidden="true" className="size-4" />
                About {pro.approxArrival.minMin}–{pro.approxArrival.maxMin} min away (estimate)
              </p>
            )}
          </div>
        ) : pro.availability.nextSlot ? (
          <p className="flex items-center gap-1.5 text-sm text-ink-900">
            <CalendarClock aria-hidden="true" className="size-4 text-ink-600" />
            Next: {nextSlotLabel(pro.availability.nextSlot, now)}
          </p>
        ) : null}
      </div>
    </article>
  )
}
