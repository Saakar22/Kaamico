import type { Metadata } from 'next'
import { CategoryCard } from '@/components/domain/catalog/category-card'
import { SearchBar } from '@/components/domain/catalog/search-bar'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { listCategories } from '@/modules/catalog/catalog'

export const metadata: Metadata = {
  title: 'All services',
  description:
    'Plumbing, electrical, cleaning, appliance repair and more from local professionals.',
}

export default async function ServicesPage() {
  const categories = await listCategories()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="All services"
        description="Pick a category to see services and real prices from professionals near you."
      />
      <SearchBar className="max-w-2xl" />
      {categories.length === 0 ? (
        <EmptyState
          title="No services yet"
          description="Services appear here once they are added. In development, run npm run db:seed."
        />
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
