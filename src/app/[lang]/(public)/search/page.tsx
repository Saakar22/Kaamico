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
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, NativeSelect } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
import { searchProfessionals } from '@/modules/matching/search'

export const metadata: Metadata = { title: 'Find a professional' }

type SearchParams = PageProps<'/[lang]/search'>['searchParams']

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'price', label: 'Price' },
  { key: 'rating', label: 'Rating' },
  { key: 'distance', label: 'Distance' },
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

function SortTabs({ filters }: { filters: Filters }) {
  return (
    <nav aria-label="Sort professionals by" className="overflow-x-auto">
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
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-ink-600 hover:text-ink-900',
                )}
              >
                {s.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** A plain GET form, so filters work without JavaScript; collapsible on phones. */
function FilterPanel({ filters }: { filters: Filters }) {
  const active = [filters.now, filters.maxPrice, filters.minRating].filter(Boolean).length
  return (
    <details
      className="group rounded-lg border border-border bg-surface md:open:bg-surface"
      open={active > 0 ? true : undefined}
    >
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 font-medium">
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        Filters{active > 0 && <span className="text-ink-600"> ({active} on)</span>}
      </summary>
      <form action="/search" className="flex flex-col gap-4 border-t border-border p-4">
        <input type="hidden" name="service" value={filters.service} />
        {filters.sort !== 'recommended' && <input type="hidden" name="sort" value={filters.sort} />}
        <label className="flex min-h-11 items-center gap-3">
          <Checkbox name="when" value="now" defaultChecked={filters.now} />
          <span>
            Available now
            <span className="block text-sm text-ink-600">Online and free to come today</span>
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Price up to
          <NativeSelect
            name="maxPrice"
            defaultValue={filters.maxPrice ? String(filters.maxPrice) : ''}
          >
            <option value="">Any price</option>
            {MAX_PRICES.map((p) => (
              <option key={p} value={p}>
                ₹{p.toLocaleString('en-IN')}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Rating
          <NativeSelect name="minRating" defaultValue={filters.minRating ?? ''}>
            <option value="">Any rating</option>
            {MIN_RATINGS.map((r) => (
              <option key={r} value={r}>
                {r} stars and above
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="flex gap-2">
          <Button type="submit">Apply filters</Button>
          {active > 0 && (
            <Button variant="tertiary" asChild>
              <Link
                href={hrefFor(filters, { now: false, maxPrice: undefined, minRating: undefined })}
              >
                Clear
              </Link>
            </Button>
          )}
        </div>
      </form>
    </details>
  )
}

async function ServiceSearch({ q }: { q?: string }) {
  const query = q?.trim() ?? ''
  if (query.length < 2) {
    const categories = await listCategories()
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Find a professional"
          description="Search for a service or pick a category."
        />
        <SearchBar className="max-w-2xl" />
        <CategoryGrid categories={categories} />
      </div>
    )
  }
  const matches = await searchServices(query.slice(0, 60))
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Services for “${query}”`} description="Pick the service you need." />
      <SearchBar defaultValue={query} className="max-w-2xl" />
      {matches.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title={`No services match “${query}”`}
            description="Try another word, like “tap”, “fan” or “cleaning”."
            action={
              <Button asChild variant="secondary">
                <Link href="/services">Browse all services</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Matching services">
          {matches.map((m) => (
            <li key={m.serviceId}>
              <Link
                href={`/search?service=${m.serviceId}`}
                className="flex min-h-14 flex-col justify-center rounded-lg border border-border bg-surface px-4 py-3 hover:border-brand-600"
              >
                <span className="font-semibold">{m.name}</span>
                <span className="text-sm text-ink-600">{m.category.name}</span>
              </Link>
            </li>
          ))}
        </ul>
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
  )

  if (result.items.length === 0) {
    const category = await getCategoryBySlug(result.service.category.slug)
    const others = category?.services.filter((s) => s.id !== result.service.id).slice(0, 4) ?? []
    return (
      <Card>
        {filters.now && result.scheduledAlternatives.length > 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No one is free right now"
            description={
              <>
                Earliest:{' '}
                {result.scheduledAlternatives
                  .map((a) => `${a.displayName.split(' ')[0]}, ${nextSlotLabel(a.start, now)}`)
                  .join(' · ')}
              </>
            }
            action={
              <Button asChild>
                <Link href={hrefFor(filters, { now: false })}>Show professionals for later</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title={
              filters.maxPrice || filters.minRating || filters.now
                ? 'No professionals match these filters'
                : 'No professionals for this service near you yet'
            }
            description={
              filters.maxPrice || filters.minRating || filters.now
                ? 'Try removing a filter.'
                : `We looked up to ${result.radiusKm} km from ${location.label}.`
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
                    Clear filters
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
        {result.total} {result.total === 1 ? 'professional' : 'professionals'} within{' '}
        {result.radiusKm} km
      </p>
      {freeNow > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-accent-500 bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <Zap aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-500" />
            <span>
              <span className="font-semibold">Need it now?</span> Send one request to the nearest
              free professionals; the first to accept is booked.
            </span>
          </p>
          <Button asChild variant="secondary" className="shrink-0">
            <Link href={`/book/${filters.service}/quick`}>Quick match</Link>
          </Button>
        </div>
      )}
      {result.radiusKm > firstRadius && (
        <p className="flex items-start gap-2 rounded-md bg-info-600/10 px-3 py-2 text-sm text-ink-900">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-600" />
          Few professionals are very close, so we&apos;re showing professionals up to{' '}
          {result.radiusKm} km away.
        </p>
      )}
      <ol className="flex flex-col gap-3" aria-label="Professionals">
        {result.items.map((pro) => (
          <li key={pro.workerId}>
            <ProfessionalCard pro={pro} serviceId={filters.service} now={now} />
          </li>
        ))}
      </ol>
      {result.nextCursor && filters.page < MAX_PAGES && (
        <Button asChild variant="secondary" className="self-center">
          <Link href={hrefFor(filters, { page: filters.page + 1 })} scroll={false}>
            Show more professionals
          </Link>
        </Button>
      )}
      <p className="text-sm text-ink-600">
        Distances are in a straight line. Arrival times are estimates based on distance.
      </p>
    </div>
  )
}

async function SearchContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const serviceId = one(params.service)
  if (!serviceId) return <ServiceSearch q={one(params.q)} />

  const service = await getService(serviceId)
  if (!service) {
    return (
      <Card>
        <EmptyState
          icon={SearchX}
          title="This service isn't available"
          description="It may have been removed. Search for another service."
          action={
            <Button asChild>
              <Link href="/services">Browse services</Link>
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
              Professionals who travel to {location.label}
            </span>
          ) : undefined
        }
      />
      {!location ? (
        <Card>
          <EmptyState
            icon={MapPin}
            title="Where do you need help?"
            description="Set your location to see professionals who travel to you, with their prices and distance."
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

function ResultsSkeleton() {
  return (
    <div
      className="flex flex-col gap-5"
      role="status"
      aria-busy="true"
      aria-label="Loading professionals"
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
