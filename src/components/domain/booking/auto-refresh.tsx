'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useLiveConnected } from '@/components/domain/realtime/live-updates'

/** While live updates are connected, timed refreshes are only a safety net. */
const LIVE_SLOWDOWN = 6

/**
 * Re-renders the page's server data every `intervalMs` while the tab is visible, and
 * straight away when the person comes back to it (§13: 5–10 s, paused when hidden).
 * With live updates connected, changes arrive at once and this runs far less often.
 */
export function useAutoRefresh(intervalMs: number, enabled = true) {
  const router = useRouter()
  const live = useLiveConnected()
  const every = live ? intervalMs * LIVE_SLOWDOWN : intervalMs
  useEffect(() => {
    if (!enabled) return
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    const timer = setInterval(refreshIfVisible, every)
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [enabled, every, router])
}

export function AutoRefresh({ intervalMs, enabled }: { intervalMs: number; enabled?: boolean }) {
  useAutoRefresh(intervalMs, enabled)
  return null
}
