import { SearchX } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'

/** Fallback for a `not-found.tsx` boundary; area boundaries keep their shell around it. */
export function RouteNotFound({
  title = "We couldn't find that page",
  description = 'The link may be broken, or the page may have moved.',
  homeHref = '/',
  homeLabel = 'Go to home',
}: {
  title?: string
  description?: string
  homeHref?: string
  homeLabel?: string
}) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState
        icon={SearchX}
        title={title}
        description={description}
        action={
          <Button asChild>
            <Link href={homeHref}>{homeLabel}</Link>
          </Button>
        }
      />
    </div>
  )
}
