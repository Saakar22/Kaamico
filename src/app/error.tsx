'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined

  return (
    <main className="flex flex-1 items-center justify-center">
      <ErrorState
        title="Something went wrong"
        description="Please try again. If it keeps happening, contact support and share the reference below."
        reference={digest}
        action={<Button onClick={() => retry()}>Try again</Button>}
      />
    </main>
  )
}
