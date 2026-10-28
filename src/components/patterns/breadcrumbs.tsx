import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

/** "Home › Pune › Plumbing": the last item is the current page and is not a link. */
export function Breadcrumbs({ items }: { items: { label: string; href: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-600">
        {items.map((item, i) => {
          const current = i === items.length - 1
          return (
            <li key={item.href} className="flex items-center gap-1">
              {i > 0 && <ChevronRight aria-hidden="true" className="size-4" />}
              {current ? (
                <span aria-current="page" className="font-medium text-ink-900">
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center text-brand-700 hover:underline"
                >
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
