'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { reportClientError } from '@/lib/report-client-error'

/**
 * Fallback for an `error.tsx` boundary. Area boundaries render inside their shell's
 * `<main>`, so this stays a plain block; the root boundary wraps it in `<main>` itself.
 */
export function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
    reportClientError(error)
  }, [error])

  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined

  return (
    <div className="flex flex-1 items-center justify-center">
      <ErrorState
        title="Something went wrong"
        description="Please try again. If it keeps happening, contact support and share the reference below."
        reference={digest}
        action={<Button onClick={() => retry()}>Try again</Button>}
      />
    </div>
  )
}
