import type { Metadata } from 'next'
import { CategoryCard } from '@/components/domain/catalog/category-card'
import { SearchBar } from '@/components/domain/catalog/search-bar'
import { PageHeader } from '@/components/patterns/page-header'
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
        <ul className="grid gap-3 md:grid-cols-2">
          {categories.map((c) => (
            <li key={c.id}>
              <CategoryCard category={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
