'use client'

import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { apiFetch } from '@/lib/api-client'
import { formatIstDateTime } from '@/lib/time'
import type { WorkerStatus } from '@/modules/workers/status'
import { useApiAction } from './use-api-action'

const PAUSES = [
  { label: 'Pause for today', hours: 'endOfDay' as const },
  { label: 'Pause for 3 days', hours: 72 },
  { label: 'Pause for a week', hours: 168 },
]

function pauseUntil(choice: (typeof PAUSES)[number]['hours'], now = new Date()): string {
  if (choice === 'endOfDay') {
    // Midnight IST tonight.
    const ist = new Date(now.getTime() + 330 * 60_000)
    ist.setUTCHours(24, 0, 0, 0)
    return new Date(ist.getTime() - 330 * 60_000).toISOString()
  }
  return new Date(now.getTime() + choice * 3_600_000).toISOString()
}

/**
 * Online/offline switch plus a pause. While online and the page is open, a heartbeat
 * keeps the professional in "available now" results; closing the app lets it lapse.
 */
export function OnlineToggle({ status, verified }: { status: WorkerStatus; verified: boolean }) {
  const { pending, error, run } = useApiAction()
  const [online, setOnline] = useState(status.online)

  useEffect(() => {
    if (!online) return
    const beat = () => {
      if (document.visibilityState === 'visible') {
        apiFetch('/api/v1/worker/presence', { body: {} }).catch(() => {})
      }
    }
    beat()
    // A few beats inside each freshness window.
    const timer = setInterval(beat, Math.max(1, status.heartbeatMinutes / 3) * 60_000)
    document.addEventListener('visibilitychange', beat)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [online, status.heartbeatMinutes])

  const toggle = (next: boolean) =>
    run(
      async () => {
        await apiFetch('/api/v1/worker/status', { body: { online: next } })
        setOnline(next)
      },
      { success: next ? 'You are online' : 'You are offline' },
    )

  const pause = (choice: (typeof PAUSES)[number]['hours'] | null) =>
    run(
      async () => {
        await apiFetch('/api/v1/worker/status', {
          body: {
            online: choice ? false : online,
            pausedUntil: choice ? pauseUntil(choice) : null,
          },
        })
        if (choice) setOnline(false)
      },
      { success: choice ? 'New requests paused' : 'Pause ended' },
    )

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center justify-between gap-4">
        <span className="flex flex-col">
          <span className="text-lg font-semibold">
            {online ? 'You are online' : 'You are offline'}
          </span>
          <span className="text-sm text-ink-600">
            {verified
              ? online
                ? 'Customers nearby can see you as available now while this app is open.'
                : 'Go online to get requests for jobs right now.'
              : 'You can go online once your ID has been verified.'}
          </span>
        </span>
        <Switch
          checked={online}
          disabled={!verified || pending}
          onCheckedChange={toggle}
          aria-label="Online"
        />
      </label>
      {verified &&
        (status.pausedUntil ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warning-700/10 px-3 py-2">
            <span className="text-sm">
              You&apos;re paused until {formatIstDateTime(new Date(status.pausedUntil))}. You
              won&apos;t get new requests.
            </span>
            <Button size="sm" variant="secondary" onClick={() => pause(null)} disabled={pending}>
              <Play aria-hidden="true" />
              Resume now
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {PAUSES.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant="tertiary"
                onClick={() => pause(p.hours)}
                disabled={pending}
              >
                <Pause aria-hidden="true" />
                {p.label}
              </Button>
            ))}
          </div>
        ))}
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
