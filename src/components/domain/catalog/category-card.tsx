import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Money } from '@/components/ui/money'
import { getT } from '@/i18n/server'
import { cn } from '@/lib/cn'
import type { CategorySummary } from '@/modules/catalog/catalog'
import { CategoryImage } from './category-image'

/** A photo tile: the category's photo, its name and the guide "from" price. */
async function CategoryTile({
  category,
  priority,
}: {
  category: CategorySummary
  priority?: boolean
}) {
  const t = await getT()
  return (
    <Link href={`/services/${category.slug}`} className="group flex flex-col gap-2.5">
      <span className="relative aspect-[3/2] overflow-hidden rounded-lg bg-mist sm:aspect-[4/3]">
        <CategoryImage
          slug={category.slug}
          iconKey={category.iconKey}
          sizes="(min-width: 1024px) 220px, (min-width: 640px) 30vw, 45vw"
          priority={priority}
          className="transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      </span>
      <span className="flex flex-col gap-0.5 px-0.5">
        <span className="font-semibold text-ink-900 group-hover:text-brand-700">
          {category.name}
        </span>
        {category.referenceFromPaise !== null && (
          <span className="text-sm text-ink-600">
            {t('catalog.typicallyFrom')}{' '}
            <Money paise={category.referenceFromPaise} className="font-semibold text-ink-900" />
          </span>
        )}
      </span>
    </Link>
  )
}

/** Categories as photo tiles (home, search). */
export function CategoryGrid({
  categories,
  label,
  className,
}: {
  categories: CategorySummary[]
  label?: string
  className?: string
}) {
  return (
    <ul
      aria-label={label}
      className={cn(
        'grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-5',
        className,
      )}
    >
      {categories.map((c, i) => (
        <li key={c.id}>
          <CategoryTile category={c} priority={i < 5} />
        </li>
      ))}
    </ul>
  )
}

/** A wide row for /services: photo, name, description, count and guide price. */
export async function CategoryCard({ category }: { category: CategorySummary }) {
  const t = await getT()
  return (
    <Link
      href={`/services/${category.slug}`}
      className="group flex items-center gap-4 rounded-xl bg-surface p-3 shadow-[var(--shadow-lift)] ring-1 ring-border transition-shadow hover:shadow-[var(--shadow-float)] motion-reduce:transition-none sm:gap-5"
    >
      <span className="relative size-24 shrink-0 overflow-hidden rounded-lg sm:h-28 sm:w-40">
        <CategoryImage
          slug={category.slug}
          iconKey={category.iconKey}
          sizes="(min-width: 640px) 160px, 96px"
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-display text-xl font-semibold group-hover:text-brand-700">
          {category.name}
        </span>
        {category.description && (
          <span className="line-clamp-2 text-sm text-ink-600">{category.description}</span>
        )}
        <span className="text-sm text-ink-600">
          {t(category.servicesCount === 1 ? 'catalog.serviceOne' : 'catalog.serviceOther', {
            count: category.servicesCount,
          })}
          {category.referenceFromPaise !== null && (
            <>
              {' · '}
              {t('catalog.typicallyFrom')}{' '}
              <Money paise={category.referenceFromPaise} className="font-semibold text-ink-900" />
            </>
          )}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="mr-1 size-5 shrink-0 text-ink-600 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  )
}
