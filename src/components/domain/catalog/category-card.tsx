import { Money } from '@/components/ui/money'
import { RateList, RateRow } from '@/components/patterns/rate-list'
import { getT } from '@/i18n/server'
import { cn } from '@/lib/cn'
import type { CategorySummary } from '@/modules/catalog/catalog'
import { CategoryIcon } from './category-icon'

/**
 * Categories as a rate list: each row links to the category and shows its guide
 * "typically from" price, so the directory doubles as a first look at prices.
 */
export async function CategoryGrid({
  categories,
  columns = 1,
  label,
}: {
  categories: CategorySummary[]
  /** Two columns from `lg` up, like a printed rate card. */
  columns?: 1 | 2
  label?: string
}) {
  const t = await getT()
  return (
    <RateList
      label={label}
      className={cn(columns === 2 && 'lg:grid lg:grid-cols-2 lg:gap-x-12 lg:border-t-0')}
    >
      {categories.map((c) => (
        <RateRow
          key={c.id}
          href={`/services/${c.slug}`}
          leading={<CategoryIcon iconKey={c.iconKey} plain />}
          label={c.name}
          className={cn(columns === 2 && 'lg:border-border lg:[&:nth-child(-n+2)]:border-t')}
          price={
            c.referenceFromPaise !== null ? (
              <>
                <span className="sr-only">{t('catalog.typicallyFrom')} </span>
                <Money paise={c.referenceFromPaise} />
              </>
            ) : undefined
          }
          priceNote={
            c.referenceFromPaise !== null ? (
              <span aria-hidden="true">{t('catalog.typicallyFrom').toLowerCase()}</span>
            ) : undefined
          }
          detail={t(c.servicesCount === 1 ? 'catalog.serviceOne' : 'catalog.serviceOther', {
            count: c.servicesCount,
          })}
        />
      ))}
    </RateList>
  )
}

/** Wider row for /services with the category's description as well. */
export async function CategoryCard({ category }: { category: CategorySummary }) {
  const t = await getT()
  return (
    <RateRow
      href={`/services/${category.slug}`}
      leading={<CategoryIcon iconKey={category.iconKey} />}
      label={<span className="font-display text-xl font-semibold">{category.name}</span>}
      price={
        category.referenceFromPaise !== null ? (
          <>
            <span className="sr-only">{t('catalog.typicallyFrom')} </span>
            <Money paise={category.referenceFromPaise} />
          </>
        ) : undefined
      }
      priceNote={
        category.referenceFromPaise !== null ? (
          <span aria-hidden="true">{t('catalog.typicallyFrom').toLowerCase()}</span>
        ) : undefined
      }
      detail={
        <>
          {category.description && <span className="block">{category.description}</span>}
          <span className="block">
            {t(category.servicesCount === 1 ? 'catalog.serviceOne' : 'catalog.serviceOther', {
              count: category.servicesCount,
            })}
          </span>
        </>
      }
    />
  )
}
