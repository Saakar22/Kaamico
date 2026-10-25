import { ChevronLeft, MapPin } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { CategoryIcon } from '@/components/domain/catalog/category-icon'
import { ServiceCard } from '@/components/domain/catalog/service-card'
import { OpenLocationButton } from '@/components/domain/location/location-chip'
import { Skeleton } from '@/components/ui/skeleton'
import { getCategoryBySlug, listCategories } from '@/modules/catalog/catalog'
import { getCategoryWithNearbyPrices } from '@/modules/catalog/nearby'
import { getCustomerLocation } from '@/modules/location/server'

type Props = PageProps<'/services/[category]'>

export async function generateStaticParams() {
  const categories = await listCategories()
  return categories.map((c) => ({ category: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategoryBySlug((await params).category)
  if (!category) return { title: 'Service not found' }
  return {
    title: `${category.name} near you`,
    description: category.description ?? undefined,
  }
}

const FAQS = [
  {
    q: 'Who sets the price?',
    a: 'Each professional sets their own price for every service. The ranges you see come from their prices, not from Kaamico.',
  },
  {
    q: 'Can I offer a different price?',
    a: 'Yes, if the professional is open to offers. You can accept their price or suggest yours, and they can accept or reply with a counter-offer.',
  },
  {
    q: 'What if the job needs extra parts or work?',
    a: 'The professional must add any extra charge in the app, with the amount, and it only counts if you approve it.',
  },
  {
    q: 'Are professionals verified?',
    a: 'A professional only appears after a Kaamico admin has checked their ID. We do not claim police or background checks unless they have been done.',
  },
]

async function CategoryContent({ params }: { params: Props['params'] }) {
  const { category: slug } = await params
  const location = await getCustomerLocation()
  // Nearby prices depend on who is active and unpaused right now.
  await connection()
  const category = await getCategoryWithNearbyPrices(slug, location)
  if (!category) notFound()

  return (
    <>
      <header className="flex flex-col gap-4">
        <Link
          href="/services"
          className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          All services
        </Link>
        <div className="flex items-start gap-4">
          <CategoryIcon iconKey={category.iconKey} className="size-14" />
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl leading-tight font-bold sm:text-3xl">
              {category.name}
            </h1>
            {category.description && <p className="text-ink-600">{category.description}</p>}
          </div>
        </div>
        {location ? (
          <p className="flex items-center gap-1.5 text-sm text-ink-600">
            <MapPin aria-hidden="true" className="size-4 text-brand-600" />
            Prices from professionals who travel to {location.label}
          </p>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
            <p>Set your location to see real prices from professionals near you.</p>
            <OpenLocationButton />
          </div>
        )}
      </header>

      <ul className="grid gap-4 md:grid-cols-2">
        {category.services.map((service) => (
          <li key={service.id}>
            <ServiceCard service={service} hasLocation={location !== null} />
          </li>
        ))}
      </ul>

      <section aria-labelledby="faq-title" className="flex flex-col gap-3">
        <h2 id="faq-title" className="font-display text-xl font-bold">
          Common questions
        </h2>
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {FAQS.map((f) => (
            <details key={f.q} className="group px-4 py-1">
              <summary className="flex min-h-11 cursor-pointer items-center font-medium">
                {f.q}
              </summary>
              <p className="pb-3 text-ink-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  )
}

function CategorySkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-label="Loading services"
    >
      <Skeleton className="h-6 w-28" />
      <div className="flex gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-56" />
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
