'use client'

import { useEffect } from 'react'
import { captureInstallPrompt } from './install'

/**
 * Registers the service worker (offline page only; see public/sw.js) in production
 * builds, and keeps the browser's install prompt for the "Install the app" card.
 * Development skips the worker so it never serves stale pages during hot reload.
 */
export function PwaSetup() {
  useEffect(() => {
    const stop = captureInstallPrompt()
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => {
          // Installing is optional: the site works the same without the worker.
        })
    }
    return stop
  }, [])
  return null
}
