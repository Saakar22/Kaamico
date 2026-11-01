import { Suspense } from 'react'
import { SearchBar } from '@/components/domain/catalog/search-bar'
import { NotificationSlot } from '@/components/domain/notifications/notification-slot'
import { LocationSlot, LocationSlotSkeleton } from '@/components/domain/location/location-slot'
import { CategoryNav } from '@/components/layout/category-nav'
import { CustomerShell } from '@/components/layout/shells'
import { getLocale, getT } from '@/i18n/server'
import { listCategories } from '@/modules/catalog/catalog'

/** The category tabs under the header's search. */
async function HeaderCategories() {
  const locale = await getLocale()
  const [categories, t] = await Promise.all([listCategories(locale), getT()])
  return (
    <CategoryNav
      items={categories.map((c) => ({ slug: c.slug, name: c.name, iconKey: c.iconKey }))}
      allLabel={t('home.allServices')}
      label={t('shell.categories')}
    />
  )
}

/** Public discovery pages: browsable signed out, with the location chip in the header. */
export default function PublicLayout({ children }: LayoutProps<'/[lang]'>) {
  return (
    <CustomerShell
      actions={
        <Suspense fallback={null}>
          <NotificationSlot />
        </Suspense>
      }
      headerSlot={
        <Suspense fallback={<LocationSlotSkeleton />}>
          <LocationSlot />
        </Suspense>
      }
      discovery={{
        search: (
          <SearchBar
            id="header-search"
            size="lg"
            className="max-w-3xl xl:rounded-xl xl:bg-surface xl:p-2 xl:shadow-[var(--shadow-float)] xl:ring-1 xl:ring-border"
          />
        ),
        compactSearch: <SearchBar id="header-search-compact" size="compact" />,
        categories: (
          <Suspense fallback={null}>
            <HeaderCategories />
          </Suspense>
        ),
      }}
    >
      {children}
    </CustomerShell>
  )
}
