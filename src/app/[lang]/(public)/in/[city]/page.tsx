import { ChevronRight, MapPin } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { CategoryIcon } from '@/components/domain/catalog/category-icon'
import { Breadcrumbs } from '@/components/patterns/breadcrumbs'
import { PageSkeleton } from '@/components/patterns/page-skeleton'
import { breadcrumbList, JsonLd } from '@/components/seo/json-ld'
import { Money } from '@/components/ui/money'
import { brand } from '@/config/brand'
import { getEnv } from '@/config/env'
import { getCity, listCities, listCityCategories } from '@/modules/seo/cities'

type Props = PageProps<'/[lang]/in/[city]'>

export async function generateStaticParams() {
  return (await listCities()).map((c) => ({ city: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const city = await getCity((await params).city)
  if (!city) return { title: 'City not found' }
  return {
    title: `Plumbers, electricians and more in ${city.name}`,
    description: `Book verified local professionals in ${city.name}. ${city.professionals} professionals across ${city.localities.length} localities set their own prices, and you can make an offer.`,
    alternates: { canonical: `/in/${city.slug}` },
  }
}

const STEPS = [
  {
    title: 'Compare real prices',
    body: 'Every professional sets their own price for each service. See it before you book.',
  },
  {
    title: 'Accept or make an offer',
    body: 'Take the listed price or suggest yours. Once you both agree, the price is locked.',
  },
  {
    title: 'Pay after the job',
    body: 'Extra charges count only if you approve them in the app. Pay in cash or online.',
  },
]

/** A city's landing page: every category with local professionals (P1 SEO city pages). */
async function CityContent({ params }: { params: Props['params'] }) {
  const { city: slug } = await params
  const [city, categories] = await Promise.all([getCity(slug), listCityCategories(slug)])
  if (!city) notFound()
  const url = `${getEnv().APP_URL}/in/${city.slug}`

  return (
    <div className="flex flex-col gap-8">
      <JsonLd
        data={breadcrumbList([
          { name: brand.name, url: getEnv().APP_URL },
          { name: city.name, url },
        ])}
      />
      <header className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: city.name, href: `/in/${city.slug}` },
          ]}
        />
        <h1 className="font-display text-2xl leading-tight font-bold sm:text-3xl">
          Home services in {city.name}
        </h1>
        <p className="max-w-2xl text-ink-600">
          {city.professionals} verified professionals across {city.localities.length} localities.
          Each one sets their own price, and you can accept it or make an offer.
        </p>
      </header>

      <section aria-labelledby="categories-title" className="flex flex-col gap-4">
        <h2 id="categories-title" className="font-display text-xl font-bold">
          Services in {city.name}
        </h2>
        {categories.length === 0 ? (
          <p className="text-ink-600">No professionals have joined in {city.name} yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/in/${city.slug}/${c.slug}`}
                  className="flex h-full items-start gap-4 rounded-lg border border-border bg-surface p-4 shadow-xs hover:border-brand-600"
                >
                  <CategoryIcon iconKey={c.iconKey} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-lg font-semibold">
                      {c.name} in {city.name}
                    </span>
                    <span className="text-sm text-ink-600">
                      {c.professionals} {c.professionals === 1 ? 'professional' : 'professionals'}
                      {c.fromPaise !== null && (
                        <>
                          {' · '}from <Money paise={c.fromPaise} />
                        </>
                      )}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-ink-600" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="how-title" className="flex flex-col gap-4">
        <h2 id="how-title" className="font-display text-xl font-bold">
          How {brand.name} works
        </h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-1 rounded-lg bg-surface-muted p-4">
              <span className="text-sm font-semibold text-brand-700">Step {i + 1}</span>
              <span className="font-semibold">{s.title}</span>
              <span className="text-sm text-ink-600">{s.body}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="areas-title" className="flex flex-col gap-3">
        <h2 id="areas-title" className="font-display text-xl font-bold">
          Areas we cover in {city.name}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {city.localities.map((l) => (
            <li
              key={l.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-sm"
            >
              <MapPin aria-hidden="true" className="size-3.5 text-brand-600" />
              {l.name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// Every known city (and city + category) is prerendered by generateStaticParams; the
// boundary only shows while an unlisted path renders on request.
export default function CityPage({ params }: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CityContent params={params} />
    </Suspense>
  )
}
