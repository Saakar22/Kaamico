'use client'

import { LayoutGrid } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense } from 'react'
import { CategoryIcon } from '@/components/domain/catalog/category-icon'
import { cn } from '@/lib/cn'

export type CategoryNavItem = { slug: string; name: string; iconKey: string }

type Props = { items: CategoryNavItem[]; allLabel: string; label: string }

function Tab({
  href,
  active,
  icon,
  children,
}: {
  href: string
  active: boolean
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <li className="shrink-0">
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          // The underline sits on the row's bottom edge, like the top nav's.
          'flex h-14 flex-col items-center justify-center gap-1 border-b-2 px-1 text-xs font-medium whitespace-nowrap transition-colors motion-reduce:transition-none',
          active
            ? 'border-ink-900 text-ink-900'
            : 'border-transparent text-ink-600 hover:border-border hover:text-ink-900',
        )}
      >
        {icon}
        {children}
      </Link>
    </li>
  )
}

function CategoryNavView({
  items,
  allLabel,
  label,
  pathname,
}: Props & { pathname: string | null }) {
  // Paths may carry a language prefix (/hi/services/...), so match on the end.
  const isAt = (path: string) => pathname !== null && pathname.endsWith(path)
  return (
    <nav aria-label={label} className="h-full">
      <ul className="flex h-full [scrollbar-width:none] items-stretch gap-6 overflow-x-auto sm:gap-8 xl:justify-center [&::-webkit-scrollbar]:hidden">
        <Tab
          href="/services"
          active={isAt('/services')}
          icon={<LayoutGrid aria-hidden="true" className="size-5" strokeWidth={1.75} />}
        >
          {allLabel}
        </Tab>
        {items.map((c) => (
          <Tab
            key={c.slug}
            href={`/services/${c.slug}`}
            active={isAt(`/services/${c.slug}`)}
            icon={<CategoryIcon iconKey={c.iconKey} plain className="size-5 text-current" />}
          >
            {c.name}
          </Tab>
        ))}
      </ul>
    </nav>
  )
}

function Live(props: Props) {
  return <CategoryNavView {...props} pathname={usePathname()} />
}

/** Category tabs under the discovery header; the current category is underlined. */
export function CategoryNav(props: Props) {
  return (
    <Suspense fallback={<CategoryNavView {...props} pathname={null} />}>
      <Live {...props} />
    </Suspense>
  )
}
