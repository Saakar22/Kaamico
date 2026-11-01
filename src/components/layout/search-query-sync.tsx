'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'

function Sync({ inputIds }: { inputIds: string[] }) {
  const pathname = usePathname()
  const q = useSearchParams().get('q')
  useEffect(() => {
    // Only results pages carry a query; elsewhere leave whatever the person typed.
    if (!pathname.endsWith('/search')) return
    for (const id of inputIds) {
      const input = document.getElementById(id)
      if (input instanceof HTMLInputElement) input.value = q ?? ''
    }
  }, [pathname, q, inputIds])
  return null
}

/**
 * Shows the current query in the header's search boxes on the results page, so the page
 * needs no search box of its own. The inputs stay plain form fields (they work before
 * JavaScript loads); this only fills them in.
 */
export function SearchQuerySync({ inputIds }: { inputIds: string[] }) {
  return (
    <Suspense fallback={null}>
      <Sync inputIds={inputIds} />
    </Suspense>
  )
}
