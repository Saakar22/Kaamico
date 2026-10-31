import type { Metadata } from 'next'
import { CategoryCard } from '@/components/domain/catalog/category-card'
import { SearchBar } from '@/components/domain/catalog/search-bar'
import { PageHeader } from '@/components/patterns/page-header'
import { RateList } from '@/components/patterns/rate-list'
import { EmptyState } from '@/components/patterns/states'
import { getLocale, getT } from '@/i18n/server'
import { listCategories } from '@/modules/catalog/catalog'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t('services.title'), description: t('services.metaDescription') }
}

export default async function ServicesPage() {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const categories = await listCategories(locale)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('services.title')} description={t('services.description')} />
      <SearchBar className="max-w-2xl" />
      {categories.length === 0 ? (
        <EmptyState title={t('services.emptyTitle')} description={t('services.emptyBody')} />
      ) : (
        <RateList className="max-w-3xl">
          {categories.map((c) => (
            <CategoryCard key={c.id} category={c} />
          ))}
        </RateList>
      )}
    </div>
  )
}
