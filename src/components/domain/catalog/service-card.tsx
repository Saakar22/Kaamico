import { Clock, Users } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/ui/money'
import { getLocale, getT } from '@/i18n/server'
import type { CategoryWithPrices } from '@/modules/catalog/nearby'
import { formatDuration, unitSuffix } from '@/modules/catalog/units'

type Service = CategoryWithPrices['services'][number]

/**
 * One line of the category's rate list: the service set against its real nearby price
 * range (from professionals' own prices) or, without enough nearby data, the platform's
 * guide range clearly labelled as such.
 */
export async function ServiceCard({
  service,
  hasLocation,
}: {
  service: Service
  hasLocation: boolean
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const range = service.nearbyPriceRange
  const guide =
    !range && service.referenceMinPaise !== null && service.referenceMaxPaise !== null
      ? { min: service.referenceMinPaise, max: service.referenceMaxPaise }
      : null
  const shown = range ? { min: range.minPaise, max: range.maxPaise } : guide

  return (
    <article className="flex flex-col gap-3 py-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
        <h2 className="font-display text-xl leading-tight font-semibold">{service.name}</h2>
        {shown && <span aria-hidden="true" className="hidden leader sm:block" />}
        {shown && (
          <p className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-sm text-ink-600">
              {range ? t('catalog.nearbyPros') : t('catalog.typical')}
            </span>{' '}
            <span className="font-display text-xl font-semibold tabular-nums">
              <Money paise={shown.min} />–<Money paise={shown.max} />
            </span>{' '}
            <span className="text-sm text-ink-600">{unitSuffix(service.unit, locale)}</span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1 text-sm text-ink-600 sm:flex-row sm:justify-between sm:gap-6">
        <div className="flex flex-col gap-1">
          {service.description && <p className="text-base text-ink-900">{service.description}</p>}
          <p className="flex items-center gap-1.5">
            <Clock aria-hidden="true" className="size-4" />
            {t('catalog.usuallyTakes', {
              duration: formatDuration(service.typicalDurationMin, locale),
            })}
          </p>
        </div>
        {range ? (
          <p className="flex items-center gap-1.5 sm:justify-end sm:text-right">
            <Users aria-hidden="true" className="size-4 shrink-0" />
            {t('catalog.setThemselves', { count: range.workerCount })}
          </p>
        ) : guide ? (
          <p className="sm:max-w-64 sm:text-right">
            {hasLocation ? t('catalog.guideNoNearby') : t('catalog.guideNoLocation')}
          </p>
        ) : null}
      </div>

      <Button asChild variant="secondary" size="sm" className="w-fit">
        <Link href={`/search?service=${service.id}`}>
          {t('catalog.seeProfessionals')}
          <span className="sr-only">{t('catalog.forService', { service: service.name })}</span>
        </Link>
      </Button>
    </article>
  )
}
