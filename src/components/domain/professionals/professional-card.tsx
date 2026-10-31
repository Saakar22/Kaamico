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
    // A rate-list line: name, leader, the professional's own price; trust facts beneath.
    <article className="group relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 py-5 transition-colors motion-reduce:transition-none sm:-mx-3 sm:rounded-md sm:px-3 sm:hover:bg-surface-muted">
      <Avatar name={pro.displayName} src={pro.photoUrl} className="row-span-2" />

      <div className="flex min-w-0 items-baseline gap-3">
        <h2 className="min-w-0 font-display text-xl leading-tight font-semibold">
          {/* The link covers the whole row; other content stays readable text. */}
          <Link href={href} className="after:absolute after:inset-0 after:rounded-md">
            {pro.displayName}
          </Link>
        </h2>
        <span aria-hidden="true" className="leader" />
        <p data-testid="pro-price" className="shrink-0 whitespace-nowrap">
          <Money paise={pro.price.paise} className="font-display text-2xl font-semibold" />{' '}
          <span className="text-sm text-ink-600" aria-hidden="true">
            {unitSuffix(pro.price.unit, locale)}
          </span>
          <span className="sr-only">{unitSpoken(pro.price.unit, locale)}</span>
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
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

        <div className="flex shrink-0 flex-col gap-1.5 text-sm sm:items-end sm:text-right">
          <p className="text-ink-600">
            {t('proCard.priceSetBy', { name: firstName(pro.displayName) })} ·{' '}
            {pro.price.negotiable ? t('proCard.openToOffers') : t('proCard.fixedPrice')}
          </p>
          {pro.availability.now ? (
            <>
              <Badge tone="success" className="w-fit">
                <Zap aria-hidden="true" />
                {t('proCard.availableNow')}
              </Badge>
              {pro.approxArrival && (
                <p className="flex items-center gap-1.5 text-ink-600">
                  <Navigation aria-hidden="true" className="size-4" />
                  {t('proCard.arrival', {
                    min: pro.approxArrival.minMin,
                    max: pro.approxArrival.maxMin,
                  })}
                </p>
              )}
            </>
          ) : pro.availability.nextSlot ? (
            <p className="flex items-center gap-1.5 text-ink-900">
              <CalendarClock aria-hidden="true" className="size-4 text-ink-600" />
              {t('proCard.next', { slot: nextSlotLabel(pro.availability.nextSlot, now, lang) })}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}
