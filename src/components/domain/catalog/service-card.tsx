import { Clock, Users } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/ui/money'
import { getLocale, getT } from '@/i18n/server'
import type { CategoryWithPrices } from '@/modules/catalog/nearby'
import { formatDuration, unitSuffix } from '@/modules/catalog/units'

type Service = CategoryWithPrices['services'][number]

/**
 * A service with its real nearby price range (from professionals' own prices) or,
 * without enough nearby data, the platform's guide range clearly labelled as such.
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
  return (
    <article className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-xs sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{service.name}</h2>
        {service.description && <p className="text-ink-600">{service.description}</p>}
      </div>
      <p className="flex items-center gap-1.5 text-sm text-ink-600">
        <Clock aria-hidden="true" className="size-4" />
        {t('catalog.usuallyTakes', {
          duration: formatDuration(service.typicalDurationMin, locale),
        })}
      </p>
      <div className="mt-auto flex flex-col gap-3 border-t border-border pt-3">
        {range ? (
          <div className="flex flex-col gap-0.5">
            <p className="font-semibold">
              {t('catalog.nearbyPros')} <Money paise={range.minPaise} />–
              <Money paise={range.maxPaise} />{' '}
              <span className="font-normal text-ink-600">{unitSuffix(service.unit, locale)}</span>
            </p>
            <p className="flex items-center gap-1.5 text-sm text-ink-600">
              <Users aria-hidden="true" className="size-4" />
              {t('catalog.setThemselves', { count: range.workerCount })}
            </p>
          </div>
        ) : service.referenceMinPaise !== null && service.referenceMaxPaise !== null ? (
          <div className="flex flex-col gap-0.5">
            <p className="font-semibold">
              {t('catalog.typical')} <Money paise={service.referenceMinPaise} />–
              <Money paise={service.referenceMaxPaise} />{' '}
              <span className="font-normal text-ink-600">{unitSuffix(service.unit, locale)}</span>
            </p>
            <p className="text-sm text-ink-600">
              {hasLocation ? t('catalog.guideNoNearby') : t('catalog.guideNoLocation')}
            </p>
          </div>
        ) : null}
        <Button asChild variant="secondary">
          <Link href={`/search?service=${service.id}`}>
            {t('catalog.seeProfessionals')}
            <span className="sr-only">{t('catalog.forService', { service: service.name })}</span>
          </Link>
        </Button>
      </div>
    </article>
  )
}
