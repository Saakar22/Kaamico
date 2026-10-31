'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/client'
import { reportClientError } from '@/lib/report-client-error'

/**
 * Fallback for an `error.tsx` boundary. Area boundaries render inside their shell's
 * `<main>`, so this stays a plain block; the root boundary wraps it in `<main>` itself.
 */
export function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT()
  useEffect(() => {
    console.error(error)
    reportClientError(error)
  }, [error])

  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined

  return (
    <div className="flex flex-1 items-center justify-center">
      <ErrorState
        title={t('pages.errorTitle')}
        description={t('pages.errorBody')}
        reference={digest}
        action={<Button onClick={() => retry()}>{t('pages.tryAgain')}</Button>}
      />
    </div>
  )
}
