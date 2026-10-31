import { ChevronLeft, MapPin, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { CategoryIcon } from '@/components/domain/catalog/category-icon'
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
        <div className="flex items-start gap-4">
          <CategoryIcon iconKey={category.iconKey} className="size-14" />
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-4xl leading-none font-semibold sm:text-5xl">
              {category.name}
            </h1>
            {category.description && <p className="text-lg text-ink-600">{category.description}</p>}
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

      <ul className="flex max-w-4xl flex-col divide-y divide-border border-y border-border">
        {category.services.map((service) => (
          <li key={service.id}>
            <ServiceCard service={service} hasLocation={location !== null} />
          </li>
        ))}
      </ul>

      <section aria-labelledby="faq-title" className="flex max-w-4xl flex-col gap-3 pt-4">
        <h2 id="faq-title" className="font-display text-2xl font-semibold">
          {t('category.faqTitle')}
        </h2>
        <div className="flex flex-col divide-y divide-border border-y border-border">
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
      <div className="flex gap-4">
        <Skeleton className="size-14 rounded-md" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </div>
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
