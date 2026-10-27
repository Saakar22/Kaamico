'use client'

import { RouteError } from '@/components/patterns/route-error'

export default function Error(props: { error: unknown; retry: () => void }) {
  return (
    <main className="flex flex-1">
      <RouteError {...props} />
    </main>
  )
}
