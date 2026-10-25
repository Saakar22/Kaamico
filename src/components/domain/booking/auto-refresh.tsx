'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Re-renders the page's server data every `intervalMs` while the tab is visible, and
 * straight away when the person comes back to it (§13: 5–10 s, paused when hidden).
 */
export function useAutoRefresh(intervalMs: number, enabled = true) {
  const router = useRouter()
  useEffect(() => {
    if (!enabled) return
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    const timer = setInterval(refreshIfVisible, intervalMs)
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [enabled, intervalMs, router])
}

export function AutoRefresh({ intervalMs, enabled }: { intervalMs: number; enabled?: boolean }) {
  useAutoRefresh(intervalMs, enabled)
  return null
}
