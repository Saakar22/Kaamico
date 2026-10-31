'use client'

import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useLocale, useT } from '@/i18n/client'
import { htmlLang } from '@/i18n/config'
import type { MessageKey } from '@/i18n/translate'
import { apiFetch } from '@/lib/api-client'
import { formatIstDateTime } from '@/lib/time'
import type { WorkerStatus } from '@/modules/workers/status'
import { useApiAction } from './use-api-action'

const PAUSES: { label: MessageKey; hours: 'endOfDay' | number }[] = [
  { label: 'online.pauseToday', hours: 'endOfDay' },
  { label: 'online.pause3', hours: 72 },
  { label: 'online.pauseWeek', hours: 168 },
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
  const t = useT()
  const lang = htmlLang[useLocale()]
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
      { success: next ? t('online.youOnline') : t('online.youOffline') },
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
      { success: choice ? t('online.paused') : t('online.resumed') },
    )

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center justify-between gap-4">
        <span className="flex flex-col">
          <span className="font-display text-2xl font-semibold">
            {online ? t('online.youOnline') : t('online.youOffline')}
          </span>
          <span className="text-sm text-ink-600">
            {verified
              ? online
                ? t('online.onlineHint')
                : t('online.offlineHint')
              : t('online.notVerified')}
          </span>
        </span>
        <Switch
          checked={online}
          disabled={!verified || pending}
          onCheckedChange={toggle}
          aria-label={t('online.label')}
        />
      </label>
      {verified &&
        (status.pausedUntil ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warning-700/10 px-3 py-2">
            <span className="text-sm">
              {t('online.pausedUntil', {
                time: formatIstDateTime(new Date(status.pausedUntil), lang),
              })}
            </span>
            <Button size="sm" variant="secondary" onClick={() => pause(null)} disabled={pending}>
              <Play aria-hidden="true" />
              {t('online.resume')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {PAUSES.map((p) => (
              <Button
                key={p.label}
                size="sm"
                // Three across everywhere, text only: labels may wrap rather than stack the buttons.
                className="h-auto min-h-10 px-1.5 py-1.5 text-xs leading-tight whitespace-normal [&_svg]:hidden"
                variant="secondary"
                onClick={() => pause(p.hours)}
                disabled={pending}
              >
                <Pause aria-hidden="true" />
                {t(p.label)}
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
