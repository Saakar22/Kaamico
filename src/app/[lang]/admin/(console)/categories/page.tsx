import type { Metadata } from 'next'
import { CatalogManager } from '@/components/domain/admin/catalog-manager'
import { CATEGORY_ICON_KEYS } from '@/components/domain/catalog/category-icon'
import { PageHeader } from '@/components/patterns/page-header'
import { listCatalogForAdmin } from '@/modules/admin/catalog'
import { requirePageActor } from '@/modules/auth/page-guards'

export const instant = false

export const metadata: Metadata = { title: 'Categories and services' }

export default async function AdminCategoriesPage() {
  await requirePageActor('ADMIN')
  const catalog = await listCatalogForAdmin()
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Categories and services"
        description="Changes show on the site straight away. Hide instead of deleting: past bookings keep their service."
      />
      <CatalogManager
        iconKeys={CATEGORY_ICON_KEYS}
        categories={catalog.map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          description: c.description,
          iconKey: c.iconKey,
          sortOrder: c.sortOrder,
          isActive: c.isActive,
          services: c.services.map((s) => ({
            id: s.id,
            categoryId: s.categoryId,
            slug: s.slug,
            name: s.name,
            description: s.description,
            pricingUnit: s.pricingUnit,
            typicalDurationMin: s.typicalDurationMin,
            referenceMinPaise: s.referenceMinPaise,
            referenceMaxPaise: s.referenceMaxPaise,
            searchTerms: s.searchTerms,
            isActive: s.isActive,
          })),
        }))}
      />
    </div>
  )
}
