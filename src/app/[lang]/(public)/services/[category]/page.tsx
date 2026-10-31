import { ChevronLeft, MapPin, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { CategoryImage } from '@/components/domain/catalog/category-image'
import { ServiceCard } from '@/components/domain/catalog/service-card'
import { OpenLocationButton } from '@/components/domain/location/location-chip'
import { Skeleton } from '@/components/ui/skeleton'
import { getLocale, getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import { getCategoryBySlug, listCategories } from '@/modules/catalog/catalog'
import { getCategoryWithNearbyPrices } from '@/modules/catalog/nearby'
import { getCustomerLocation } from '@/modules/location/server'

type Props = PageProps<'/[lang]/services/[category]'>

export async function generateStaticParams() {
  const categories = await listCategories()
  return categories.map((c) => ({ category: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const category = await getCategoryBySlug((await params).category, locale)
  if (!category) return { title: t('category.notFound') }
  return {
    title: t('category.metaTitle', { category: category.name }),
    description: category.description ?? undefined,
  }
}

const FAQS: { q: MessageKey; a: MessageKey }[] = [
  { q: 'category.faq1q', a: 'category.faq1a' },
  { q: 'category.faq2q', a: 'category.faq2a' },
  { q: 'category.faq3q', a: 'category.faq3a' },
  { q: 'category.faq4q', a: 'category.faq4a' },
]

async function CategoryContent({ params }: { params: Props['params'] }) {
  const { category: slug } = await params
  const [location, t, locale] = await Promise.all([getCustomerLocation(), getT(), getLocale()])
  // Nearby prices depend on who is active and unpaused right now.
  await connection()
  const category = await getCategoryWithNearbyPrices(slug, location, new Date(), locale)
  if (!category) notFound()

  return (
    <>
      <header className="flex flex-col gap-4">
        <Link
          href="/services"
          className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t('category.allServices')}
        </Link>
        {/* Photo banner: what this kind of work looks like, with the name set on it. */}
        <div className="relative flex min-h-56 items-end overflow-hidden rounded-xl bg-night sm:min-h-72">
          <CategoryImage
            slug={category.slug}
            iconKey={category.iconKey}
            sizes="(min-width: 1200px) 1152px, 100vw"
            priority
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-night via-night/45 to-transparent"
          />
          <div className="relative flex flex-col gap-1 p-5 sm:p-8">
            <h1 className="font-display text-4xl leading-none font-semibold text-on-night sm:text-6xl">
              {category.name}
            </h1>
            {category.description && (
              <p className="text-lg text-on-night-muted">{category.description}</p>
            )}
          </div>
        </div>
        {location ? (
          <p className="flex items-center gap-1.5 text-sm text-ink-600">
            <MapPin aria-hidden="true" className="size-4 text-brand-600" />
            {t('category.pricesFrom', { place: location.label })}
          </p>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-md bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
            <p>{t('category.setLocation')}</p>
            <OpenLocationButton />
          </div>
        )}
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <ul className="flex flex-col divide-y divide-border rounded-xl bg-surface px-5 shadow-[var(--shadow-lift)] ring-1 ring-border sm:px-7">
          {category.services.map((service) => (
            <li key={service.id}>
              <ServiceCard service={service} hasLocation={location !== null} />
            </li>
          ))}
        </ul>

        <section aria-labelledby="faq-title" className="flex flex-col gap-3 lg:sticky lg:top-24">
          <h2 id="faq-title" className="font-display text-xl font-semibold">
            {t('category.faqTitle')}
          </h2>
          <div className="flex flex-col divide-y divide-border rounded-xl bg-surface px-4 shadow-[var(--shadow-lift)] ring-1 ring-border sm:px-6">
            {FAQS.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
                  {t(f.q)}
                  <Plus
                    aria-hidden="true"
                    className="size-4 shrink-0 text-ink-600 transition-transform group-open:rotate-45 motion-reduce:transition-none"
                  />
                </summary>
                <p className="max-w-prose pb-4 text-ink-600">{t(f.a)}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

async function CategorySkeleton() {
  const t = await getT()
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-label={t('category.loading')}
    >
      <Skeleton className="h-6 w-28" />
      <Skeleton className="h-56 rounded-xl sm:h-72" />
      <div className="flex max-w-4xl flex-col gap-6">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  )
}

export default function CategoryPage({ params }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={<CategorySkeleton />}>
        <CategoryContent params={params} />
      </Suspense>
    </div>
  )
}
