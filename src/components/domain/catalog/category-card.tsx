import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Money } from '@/components/ui/money'
import { getT } from '@/i18n/server'
import type { CategorySummary } from '@/modules/catalog/catalog'
import { CategoryIcon } from './category-icon'

/** Compact tile for the home grid. */
export function CategoryTile({ category }: { category: CategorySummary }) {
  return (
    <Link
      href={`/services/${category.slug}`}
      className="flex h-full flex-col items-center gap-2 rounded-lg border border-border bg-surface p-4 text-center shadow-xs hover:border-brand-600 hover:bg-brand-50/40"
    >
      <CategoryIcon iconKey={category.iconKey} />
      <span className="text-sm font-semibold sm:text-base">{category.name}</span>
    </Link>
  )
}

export function CategoryGrid({ categories }: { categories: CategorySummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {categories.map((c) => (
        <li key={c.id}>
          <CategoryTile category={c} />
        </li>
      ))}
    </ul>
  )
}

/** Wider card for /services with a description, service count and guide price. */
export async function CategoryCard({ category }: { category: CategorySummary }) {
  const t = await getT()
  return (
    <Link
      href={`/services/${category.slug}`}
      className="flex h-full items-start gap-4 rounded-lg border border-border bg-surface p-4 shadow-xs hover:border-brand-600 sm:p-5"
    >
      <CategoryIcon iconKey={category.iconKey} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-lg font-semibold">{category.name}</span>
        {category.description && <span className="text-ink-600">{category.description}</span>}
        <span className="text-sm text-ink-600">
          {t(category.servicesCount === 1 ? 'catalog.serviceOne' : 'catalog.serviceOther', {
            count: category.servicesCount,
          })}
          {category.referenceFromPaise !== null && (
            <>
              {' · '}
              {t('catalog.typicallyFrom')} <Money paise={category.referenceFromPaise} />
            </>
          )}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-ink-600" />
    </Link>
  )
}
