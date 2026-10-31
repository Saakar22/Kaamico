import { SearchX } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { getT } from '@/i18n/server'

/** Fallback for a `not-found.tsx` boundary; area boundaries keep their shell around it. */
export async function RouteNotFound({
  title,
  description,
  homeHref = '/',
  homeLabel,
}: {
  title?: string
  description?: string
  homeHref?: string
  homeLabel?: string
}) {
  const t = await getT()
  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState
        icon={SearchX}
        title={title ?? t('pages.notFoundTitle')}
        description={description ?? t('pages.notFoundBody')}
        action={
          <Button asChild>
            <Link href={homeHref}>{homeLabel ?? t('pages.home')}</Link>
          </Button>
        }
      />
    </div>
  )
}
