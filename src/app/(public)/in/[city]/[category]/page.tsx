import { BadgeCheck, MapPin } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { CategoryIcon } from '@/components/domain/catalog/category-icon'
import { RatingSummary } from '@/components/domain/professionals/rating'
import { Breadcrumbs } from '@/components/patterns/breadcrumbs'
import { PageSkeleton } from '@/components/patterns/page-skeleton'
import { breadcrumbList, JsonLd } from '@/components/seo/json-ld'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/ui/money'
import { brand } from '@/config/brand'
import { getEnv } from '@/config/env'
import { unitSuffix } from '@/modules/catalog/units'
import { getCityCategory, listCities, listCityCategories } from '@/modules/seo/cities'

type Props = PageProps<'/in/[city]/[category]'>

export async function generateStaticParams() {
  const cities = await listCities()
  const params = await Promise.all(
    cities.map(async (city) =>
      (await listCityCategories(city.slug)).map((c) => ({ city: city.slug, category: c.slug })),
    ),
  )
  return params.flat()
}

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city, category } = await params
  const page = await getCityCategory(city, category)
  if (!page) return { title: 'Service not found' }
  const lows = page.services.flatMap((s) => (s.lowPaise === null ? [] : [s.lowPaise]))
  const from = lows.length > 0 ? ` from ${rupees(Math.min(...lows))}` : ''
  return {
    title: `${page.category.name} in ${page.city.name}`,
    description: `${page.professionals.length > 0 ? 'Verified' : 'Book'} ${page.category.name.toLowerCase()} professionals in ${page.city.name}${from}. See each professional's own price and make an offer.`,
    alternates: { canonical: `/in/${page.city.slug}/${page.category.slug}` },
  }
}

/** One category in one city: local prices, top professionals and areas (P1 SEO city pages). */
async function CityCategoryContent({ params }: { params: Props['params'] }) {
  const { city: citySlug, category: categorySlug } = await params
  const [page, siblings] = await Promise.all([
    getCityCategory(citySlug, categorySlug),
    listCityCategories(citySlug),
  ])
  if (!page) notFound()
  const { city, category } = page
  const base = getEnv().APP_URL
  const url = `${base}/in/${city.slug}/${category.slug}`
  const offered = page.services.filter((s) => s.professionals > 0)
  const others = siblings.filter((c) => c.slug !== category.slug)

  return (
    <div className="flex flex-col gap-8">
      <JsonLd
        data={breadcrumbList([
          { name: brand.name, url: base },
          { name: city.name, url: `${base}/in/${city.slug}` },
          { name: category.name, url },
        ])}
      />
      {offered.length > 0 && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: `${category.name} in ${city.name}`,
            itemListElement: offered.map((s, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              item: {
                '@type': 'Service',
                name: s.name,
                serviceType: category.name,
                areaServed: { '@type': 'City', name: city.name },
                provider: { '@type': 'Organization', name: brand.name, url: base },
                ...(s.lowPaise !== null && s.highPaise !== null
                  ? {
                      offers: {
                        '@type': 'AggregateOffer',
                        priceCurrency: 'INR',
                        lowPrice: (s.lowPaise / 100).toFixed(2),
                        highPrice: (s.highPaise / 100).toFixed(2),
                        offerCount: s.professionals,
                      },
                    }
                  : {}),
              },
            })),
          }}
        />
      )}

      <header className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: city.name, href: `/in/${city.slug}` },
            { label: category.name, href: `/in/${city.slug}/${category.slug}` },
          ]}
        />
        <div className="flex items-start gap-4">
          <CategoryIcon iconKey={category.iconKey} className="size-14" />
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl leading-tight font-bold sm:text-3xl">
              {category.name} in {city.name}
            </h1>
            {category.description && <p className="text-ink-600">{category.description}</p>}
          </div>
        </div>
      </header>

      <section aria-labelledby="prices-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="prices-title" className="font-display text-xl font-bold">
            What professionals in {city.name} charge
          </h2>
          <p className="text-sm text-ink-600">
            From the prices professionals set themselves. Most charge within the range shown; you
            can also make an offer.
          </p>
        </div>
        <ul className="grid gap-3 md:grid-cols-2">
          {page.services.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
            >
              <span className="font-semibold">{s.name}</span>
              {s.professionals > 0 && s.lowPaise !== null && s.highPaise !== null ? (
                <>
                  <span className="text-sm">
                    {s.lowPaise === s.highPaise ? (
                      <Money paise={s.lowPaise} />
                    ) : (
                      <>
                        <Money paise={s.lowPaise} />–<Money paise={s.highPaise} />
                      </>
                    )}{' '}
                    <span className="text-ink-600">{unitSuffix(s.unit)}</span>
                  </span>
                  <span className="text-sm text-ink-600">
                    {s.professionals} {s.professionals === 1 ? 'professional' : 'professionals'}{' '}
                    offer this
                  </span>
                  <Button asChild variant="secondary" size="sm" className="mt-1 self-start">
                    <Link href={`/search?service=${s.id}`}>See professionals</Link>
                  </Button>
                </>
              ) : (
                <span className="text-sm text-ink-600">Nobody in {city.name} offers this yet.</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {page.professionals.length > 0 && (
        <section aria-labelledby="pros-title" className="flex flex-col gap-4">
          <h2 id="pros-title" className="font-display text-xl font-bold">
            Top-rated {category.name.toLowerCase()} professionals in {city.name}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {page.professionals.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/professionals/${p.id}`}
                  className="flex h-full gap-3 rounded-lg border border-border bg-surface p-4 shadow-xs hover:border-brand-600"
                >
                  <Avatar name={p.displayName} src={p.photoUrl} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-1 font-semibold">
                      {p.displayName}
                      <BadgeCheck
                        aria-label="ID verified"
                        className="size-4 shrink-0 text-success-700"
                      />
                    </span>
                    <RatingSummary avg={p.ratingAverage} count={p.ratingCount} />
                    <span className="text-sm text-ink-600">
                      {p.completedJobs} jobs done · {p.yearsExperience} yrs experience
                    </span>
                    {p.locality && (
                      <span className="flex items-center gap-1 text-sm text-ink-600">
                        <MapPin aria-hidden="true" className="size-3.5" />
                        {p.locality}
                      </span>
                    )}
                    <span className="text-sm">
                      From <Money paise={p.fromPaise} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {page.localities.length > 0 && (
        <section aria-labelledby="areas-title" className="flex flex-col gap-3">
          <h2 id="areas-title" className="font-display text-xl font-bold">
            Where they are based
          </h2>
          <p className="text-ink-600">{page.localities.join(', ')}.</p>
        </section>
      )}

      {others.length > 0 && (
        <section aria-labelledby="more-title" className="flex flex-col gap-3">
          <h2 id="more-title" className="font-display text-xl font-bold">
            More services in {city.name}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {others.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/in/${city.slug}/${c.slug}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-4 text-sm hover:border-brand-600"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// Every known city (and city + category) is prerendered by generateStaticParams; the
// boundary only shows while an unlisted path renders on request.
export default function CityCategoryPage({ params }: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CityCategoryContent params={params} />
    </Suspense>
  )
}
