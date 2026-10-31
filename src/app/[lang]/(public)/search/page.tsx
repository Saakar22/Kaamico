import {
  CalendarClock,
  ChevronLeft,
  Info,
  MapPin,
  SearchX,
  SlidersHorizontal,
  Zap,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { CategoryGrid } from '@/components/domain/catalog/category-card'
import { SearchBar } from '@/components/domain/catalog/search-bar'
import { OpenLocationButton } from '@/components/domain/location/location-chip'
import {
  nextSlotLabel,
  ProfessionalCard,
} from '@/components/domain/professionals/professional-card'
import { PageHeader } from '@/components/patterns/page-header'
import { RateList, RateRow } from '@/components/patterns/rate-list'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, NativeSelect } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { htmlLang } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import {
  getCategoryBySlug,
  getService,
  listCategories,
  searchServices,
} from '@/modules/catalog/catalog'
import type { CustomerLocation } from '@/modules/location/location'
import { getCustomerLocation } from '@/modules/location/server'
import { matchingConfig } from '@/modules/matching/config'
import type { SortKey } from '@/modules/matching/scoring'
import { getActor } from '@/modules/auth/actor'
import { searchProfessionals } from '@/modules/matching/search'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('searchPage.metaTitle') }
}

type SearchParams = PageProps<'/[lang]/search'>['searchParams']

const SORTS: { key: SortKey; label: MessageKey }[] = [
  { key: 'recommended', label: 'searchPage.sortRecommended' },
  { key: 'price', label: 'searchPage.sortPrice' },
  { key: 'rating', label: 'searchPage.sortRating' },
  { key: 'distance', label: 'searchPage.sortDistance' },
]
const MAX_PRICES = [300, 500, 1000, 2000, 5000]
const MIN_RATINGS = ['4.5', '4', '3.5']
const MAX_PAGES = 5

type Filters = {
  service: string
  sort: SortKey
  now: boolean
  maxPrice?: number
  minRating?: string
  page: number
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

function parseFilters(params: Awaited<SearchParams>, service: string): Filters {
  const sort = SORTS.find((s) => s.key === one(params.sort))?.key ?? 'recommended'
  const maxPrice = Number(one(params.maxPrice))
  const minRating = one(params.minRating)
  const page = Math.min(MAX_PAGES, Math.max(1, Math.floor(Number(one(params.page)) || 1)))
  return {
    service,
    sort,
    now: one(params.when) === 'now',
    maxPrice: MAX_PRICES.includes(maxPrice) ? maxPrice : undefined,
    minRating: minRating && MIN_RATINGS.includes(minRating) ? minRating : undefined,
    page,
  }
}

function hrefFor(filters: Filters, changes: Partial<Filters> = {}): string {
  const f = { ...filters, page: 1, ...changes }
  const qs = new URLSearchParams({ service: f.service })
  if (f.sort !== 'recommended') qs.set('sort', f.sort)
  if (f.now) qs.set('when', 'now')
  if (f.maxPrice) qs.set('maxPrice', String(f.maxPrice))
  if (f.minRating) qs.set('minRating', f.minRating)
  if (f.page > 1) qs.set('page', String(f.page))
  return `/search?${qs}`
}

async function SortTabs({ filters }: { filters: Filters }) {
  const t = await getT()
  return (
    <nav aria-label={t('searchPage.sortBy')} className="overflow-x-auto">
      <ul className="flex gap-1 border-b border-border">
        {SORTS.map((s) => {
          const active = s.key === filters.sort
          return (
            <li key={s.key}>
              <Link
                href={hrefFor(filters, { sort: s.key })}
                aria-current={active ? 'page' : undefined}
                scroll={false}
                className={cn(
                  '-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap',
                  active
                    ? 'border-brand-600 text-ink-900'
                    : 'border-transparent text-ink-600 hover:text-ink-900',
                )}
              >
                {t(s.label)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** A plain GET form, so filters work without JavaScript; collapsible on phones. */
async function FilterPanel({ filters }: { filters: Filters }) {
  const t = await getT()
  const active = [filters.now, filters.maxPrice, filters.minRating].filter(Boolean).length
  return (
    <details
      className="group rounded-md border border-border bg-surface"
      open={active > 0 ? true : undefined}
    >
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 font-medium">
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        {t('searchPage.filters')}
        {active > 0 && (
          <span className="text-ink-600">{t('searchPage.filtersOn', { count: active })}</span>
        )}
      </summary>
      <form action="/search" className="flex flex-col gap-4 border-t border-border p-4">
        <input type="hidden" name="service" value={filters.service} />
        {filters.sort !== 'recommended' && <input type="hidden" name="sort" value={filters.sort} />}
        <label className="flex min-h-11 items-center gap-3">
          <Checkbox name="when" value="now" defaultChecked={filters.now} />
          <span>
            {t('searchPage.availableNow')}
            <span className="block text-sm text-ink-600">{t('searchPage.availableNowHint')}</span>
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('searchPage.priceUpTo')}
          <NativeSelect
            name="maxPrice"
            defaultValue={filters.maxPrice ? String(filters.maxPrice) : ''}
          >
            <option value="">{t('searchPage.anyPrice')}</option>
            {MAX_PRICES.map((p) => (
              <option key={p} value={p}>
                ₹{p.toLocaleString('en-IN')}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('searchPage.rating')}
          <NativeSelect name="minRating" defaultValue={filters.minRating ?? ''}>
            <option value="">{t('searchPage.anyRating')}</option>
            {MIN_RATINGS.map((r) => (
              <option key={r} value={r}>
                {t('searchPage.starsAndAbove', { rating: r })}
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="flex gap-2">
          <Button type="submit">{t('searchPage.applyFilters')}</Button>
          {active > 0 && (
            <Button variant="tertiary" asChild>
              <Link
                href={hrefFor(filters, { now: false, maxPrice: undefined, minRating: undefined })}
              >
                {t('searchPage.clear')}
              </Link>
            </Button>
          )}
        </div>
      </form>
    </details>
  )
}

async function ServiceSearch({ q }: { q?: string }) {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const query = q?.trim() ?? ''
  if (query.length < 2) {
    const categories = await listCategories(locale)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t('searchPage.findTitle')}
          description={t('searchPage.findDescription')}
        />
        <SearchBar className="max-w-2xl" />
        <CategoryGrid categories={categories} columns={2} />
      </div>
    )
  }
  const matches = await searchServices(query.slice(0, 60), 10, locale)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('searchPage.servicesFor', { query })}
        description={t('searchPage.pickService')}
      />
      <SearchBar defaultValue={query} className="max-w-2xl" />
      {matches.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title={t('searchPage.noServicesMatch', { query })}
            description={t('searchPage.tryAnotherWord')}
            action={
              <Button asChild variant="secondary">
                <Link href="/services">{t('searchPage.browseAll')}</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <RateList label={t('searchPage.matchingServices')} className="max-w-3xl">
          {matches.map((m) => (
            <RateRow
              key={m.serviceId}
              href={`/search?service=${m.serviceId}`}
              label={<span className="font-semibold">{m.name}</span>}
              detail={m.category.name}
            />
          ))}
        </RateList>
      )}
    </div>
  )
}

async function ProfessionalResults({
  filters,
  location,
}: {
  filters: Filters
  location: CustomerLocation
}) {
  // Availability is computed against the current time.
  await connection()
  const [t, locale, actor] = await Promise.all([getT(), getLocale(), getActor()])
  const now = new Date()
  const result = await searchProfessionals(
    {
      serviceId: filters.service,
      lat: location.lat,
      lng: location.lng,
      sort: filters.sort,
      when: filters.now ? 'now' : undefined,
      maxPricePaise: filters.maxPrice ? filters.maxPrice * 100 : undefined,
      minRating: filters.minRating ? Number(filters.minRating) : undefined,
      limit: Math.min(50, filters.page * matchingConfig.pageSize),
    },
    now,
    actor?.roles.includes('CUSTOMER') ? actor.userId : undefined,
  )

  if (result.items.length === 0) {
    const category = await getCategoryBySlug(result.service.category.slug, locale)
    const others = category?.services.filter((s) => s.id !== result.service.id).slice(0, 4) ?? []
    return (
      <Card>
        {filters.now && result.scheduledAlternatives.length > 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={t('searchPage.noOneFree')}
            description={
              <>
                {t('searchPage.earliest')}{' '}
                {result.scheduledAlternatives
                  .map(
                    (a) =>
                      `${a.displayName.split(' ')[0]}, ${nextSlotLabel(a.start, now, htmlLang[locale])}`,
                  )
                  .join(' · ')}
              </>
            }
            action={
              <Button asChild>
                <Link href={hrefFor(filters, { now: false })}>{t('searchPage.showForLater')}</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title={
              filters.maxPrice || filters.minRating || filters.now
                ? t('searchPage.noMatchFilters')
                : t('searchPage.noneNearby')
            }
            description={
              filters.maxPrice || filters.minRating || filters.now
                ? t('searchPage.tryRemovingFilter')
                : t('searchPage.lookedUpTo', { km: result.radiusKm, place: location.label })
            }
            action={
              filters.maxPrice || filters.minRating || filters.now ? (
                <Button asChild variant="secondary">
                  <Link
                    href={hrefFor(filters, {
                      now: false,
                      maxPrice: undefined,
                      minRating: undefined,
                    })}
                  >
                    {t('searchPage.clearFilters')}
                  </Link>
                </Button>
              ) : (
                others.map((s) => (
                  <Button key={s.id} asChild variant="secondary" size="sm">
                    <Link href={`/search?service=${s.id}`}>{s.name}</Link>
                  </Button>
                ))
              )
            }
          />
        )}
      </Card>
    )
  }

  const firstRadius = matchingConfig.radiiKm[0]
  const freeNow = result.items.filter((p) => p.availability.now).length
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-600" aria-live="polite">
        {t(result.total === 1 ? 'searchPage.countOne' : 'searchPage.countOther', {
          count: result.total,
          km: result.radiusKm,
        })}
      </p>
      {freeNow > 0 && (
        <div className="flex flex-col gap-3 rounded-md border border-accent-500/70 bg-accent-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <Zap aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-700" />
            <span>
              <span className="font-semibold">{t('searchPage.needItNow')}</span>{' '}
              {t('searchPage.quickMatchPitch')}
            </span>
          </p>
          <Button asChild variant="secondary" className="shrink-0">
            <Link href={`/book/${filters.service}/quick`}>{t('searchPage.quickMatch')}</Link>
          </Button>
        </div>
      )}
      {result.radiusKm > firstRadius && (
        <p className="flex items-start gap-2 rounded-md bg-info-600/10 px-3 py-2 text-sm text-ink-900">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-600" />
          {t('searchPage.widerRadius', { km: result.radiusKm })}
        </p>
      )}
      <ol
        className="flex flex-col divide-y divide-border border-y border-border"
        aria-label={t('searchPage.professionals')}
      >
        {result.items.map((pro) => (
          <li key={pro.workerId}>
            <ProfessionalCard pro={pro} serviceId={filters.service} now={now} />
          </li>
        ))}
      </ol>
      {result.nextCursor && filters.page < MAX_PAGES && (
        <Button asChild variant="secondary" className="self-center">
          <Link href={hrefFor(filters, { page: filters.page + 1 })} scroll={false}>
            {t('searchPage.showMore')}
          </Link>
        </Button>
      )}
      <p className="text-sm text-ink-600">{t('searchPage.distanceNote')}</p>
    </div>
  )
}

async function SearchContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const serviceId = one(params.service)
  if (!serviceId) return <ServiceSearch q={one(params.q)} />

  const [t, locale] = await Promise.all([getT(), getLocale()])
  const service = await getService(serviceId, locale)
  if (!service) {
    return (
      <Card>
        <EmptyState
          icon={SearchX}
          title={t('searchPage.unavailableTitle')}
          description={t('searchPage.unavailableBody')}
          action={
            <Button asChild>
              <Link href="/services">{t('searchPage.browseServices')}</Link>
            </Button>
          }
        />
      </Card>
    )
  }

  const filters = parseFilters(params, service.id)
  const location = await getCustomerLocation()
  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/services/${service.category.slug}`}
        className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {service.category.name}
      </Link>
      <PageHeader
        title={service.name}
        description={
          location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden="true" className="size-4 text-brand-600" />
              {t('searchPage.travelTo', { place: location.label })}
            </span>
          ) : undefined
        }
      />
      {!location ? (
        <Card>
          <EmptyState
            icon={MapPin}
            title={t('searchPage.whereTitle')}
            description={t('searchPage.whereBody')}
            action={<OpenLocationButton />}
          />
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-[16rem_minmax(0,1fr)] md:items-start">
          <div className="md:sticky md:top-20">
            <FilterPanel filters={filters} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <SortTabs filters={filters} />
            <ProfessionalResults filters={filters} location={location} />
          </div>
        </div>
      )}
    </div>
  )
}

async function ResultsSkeleton() {
  const t = await getT()
  return (
    <div
      className="flex flex-col gap-5"
      role="status"
      aria-busy="true"
      aria-label={t('searchPage.loading')}
    >
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-11 w-full" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-36" />
      ))}
    </div>
  )
}

export default function SearchPage({ searchParams }: PageProps<'/[lang]/search'>) {
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <SearchContent searchParams={searchParams} />
    </Suspense>
  )
}
