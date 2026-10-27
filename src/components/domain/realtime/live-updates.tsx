'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useSyncExternalStore } from 'react'

/**
 * Live updates over server-sent events (`/api/v1/events`). While connected, booking
 * changes refresh the page's server data at once and new notifications update the bell;
 * timed polling then slows right down instead of stopping, as a safety net. EventSource
 * reconnects by itself after a dropped connection.
 */

const NOTIFICATION_EVENT = 'kmc:notification'
const REFRESH_DEBOUNCE_MS = 300

let connected = false
const listeners = new Set<() => void>()
function setConnected(next: boolean) {
  if (connected === next) return
  connected = next
  for (const l of listeners) l()
}

/** Whether the live connection is up (polling can slow down meanwhile). */
export function useLiveConnected(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => connected,
    () => false,
  )
}

/** Calls `onNotification` whenever the live connection reports a new notification. */
export function useOnLiveNotification(onNotification: () => void) {
  useEffect(() => {
    window.addEventListener(NOTIFICATION_EVENT, onNotification)
    return () => window.removeEventListener(NOTIFICATION_EVENT, onNotification)
  }, [onNotification])
}

/** Opens the stream; render once per signed-in page (the header does). */
export function LiveUpdates() {
  const router = useRouter()
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const source = new EventSource('/api/v1/events')
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS)
    }
    source.addEventListener('ready', () => setConnected(true))
    source.addEventListener('booking', refresh)
    source.addEventListener('notification', () => {
      window.dispatchEvent(new Event(NOTIFICATION_EVENT))
      refresh()
    })
    source.onerror = () => setConnected(false)
    return () => {
      clearTimeout(timer)
      source.close()
      setConnected(false)
    }
  }, [router])
  return null
}
