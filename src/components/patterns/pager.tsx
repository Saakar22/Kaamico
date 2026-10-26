import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

/** Previous / next links that keep the current filters (`params`) in the URL. */
export function Pager({
  path,
  params,
  page,
  hasMore,
}: {
  path: string
  params: Record<string, string | undefined>
  page: number
  hasMore: boolean
}) {
  if (page === 1 && !hasMore) return null
  const href = (p: number) => {
    const qs = new URLSearchParams(
      Object.entries({ ...params, page: p > 1 ? String(p) : undefined }).filter(
        (e): e is [string, string] => !!e[1],
      ),
    )
    return qs.size ? `${path}?${qs}` : path
  }
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-2">
      {page > 1 ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={href(page - 1)}>
            <ChevronLeft aria-hidden="true" />
            Previous
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-sm text-ink-600">Page {page}</span>
      {hasMore ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={href(page + 1)}>
            Next
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  )
}
