import { CalendarClock, Navigation, Sprout, Zap } from 'lucide-react'
import Link from 'next/link'
import { VerificationBadge } from '@/components/domain/trust-badges'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Money } from '@/components/ui/money'
import { htmlLang } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import { formatIstDay, formatIstTime } from '@/lib/time'
import { unitSpoken, unitSuffix } from '@/modules/catalog/units'
import type { ProfessionalResult } from '@/modules/matching/search'
import { languageNames } from '@/modules/professionals/languages'
import { RatingSummary } from './rating'

const firstName = (name: string) => name.trim().split(/\s+/)[0]

/** "Next: Tomorrow, 10:00 am" */
export function nextSlotLabel(iso: string, now: Date = new Date(), lang = 'en-IN'): string {
  const date = new Date(iso)
  return `${formatIstDay(date, now, lang)}, ${formatIstTime(date, lang)}`
}

/**
 * One search result. Every trust signal lives here so all lists show the same facts:
 * verification, rating with count, distance, the worker's own price and availability.
 */
export async function ProfessionalCard({
  pro,
  serviceId,
  now,
}: {
  pro: ProfessionalResult
  serviceId: string
  now?: Date
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const lang = htmlLang[locale]
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
                {t('badges.newOnKaamico')}
              </Badge>
            )}
            <RatingSummary avg={pro.rating.avg} count={pro.rating.count} />
          </div>
          <p className="text-sm text-ink-600">
            {t('proCard.kmAway', { km: pro.distanceKm.toFixed(1) })}
            {pro.completedJobs > 0 && <> · {t('proCard.jobsDone', { count: pro.completedJobs })}</>}
            {pro.yearsExperience > 0 && (
              <> · {t('proCard.yearsExperience', { count: pro.yearsExperience })}</>
            )}
          </p>
          {pro.languages.length > 0 && (
            <p className="text-sm text-ink-600">
              {t('proCard.speaks', { languages: languageNames(pro.languages, lang) })}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3 sm:w-56 sm:shrink-0 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
        <p data-testid="pro-price">
          <Money paise={pro.price.paise} className="text-xl font-bold" />{' '}
          <span className="text-ink-600" aria-hidden="true">
            {unitSuffix(pro.price.unit, locale)}
          </span>
          <span className="sr-only">{unitSpoken(pro.price.unit, locale)}</span>
        </p>
        <p className="text-sm text-ink-600">
          {t('proCard.priceSetBy', { name: firstName(pro.displayName) })} ·{' '}
          {pro.price.negotiable ? t('proCard.openToOffers') : t('proCard.fixedPrice')}
        </p>
        {pro.availability.now ? (
          <div className="flex flex-col gap-1">
            <Badge tone="success" className="w-fit">
              <Zap aria-hidden="true" />
              {t('proCard.availableNow')}
            </Badge>
            {pro.approxArrival && (
              <p className="flex items-center gap-1.5 text-sm text-ink-600">
                <Navigation aria-hidden="true" className="size-4" />
                {t('proCard.arrival', {
                  min: pro.approxArrival.minMin,
                  max: pro.approxArrival.maxMin,
                })}
              </p>
            )}
          </div>
        ) : pro.availability.nextSlot ? (
          <p className="flex items-center gap-1.5 text-sm text-ink-900">
            <CalendarClock aria-hidden="true" className="size-4 text-ink-600" />
            {t('proCard.next', { slot: nextSlotLabel(pro.availability.nextSlot, now, lang) })}
          </p>
        ) : null}
      </div>
    </article>
  )
}
