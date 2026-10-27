'use client'

import { Bell, CheckCheck } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  LiveUpdates,
  useLiveConnected,
  useOnLiveNotification,
} from '@/components/domain/realtime/live-updates'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { apiFetch } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { formatIstDateTime } from '@/lib/time'
import type { NotificationView } from '@/modules/notifications/notifications'

const POLL_MS = 30_000

/**
 * Unread count in the header: updated the moment a notification arrives when live
 * updates are on (`live`), otherwise polled while the tab is visible. Opening it lists
 * the latest notifications. The same component serves customers and professionals.
 */
export function NotificationBell({
  initialUnread,
  live = false,
}: {
  initialUnread: number
  live?: boolean
}) {
  const [unread, setUnread] = useState(initialUnread)
  const [items, setItems] = useState<NotificationView[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)

  const poll = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    try {
      setUnread((await apiFetch<{ unread: number }>('/api/v1/notifications/unread-count')).unread)
    } catch {
      // Signed out or offline: keep the last count; the next poll tries again.
    }
  }, [])

  const connected = useLiveConnected()
  useOnLiveNotification(poll)
  useEffect(() => {
    if (connected) return
    const timer = setInterval(poll, POLL_MS)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [poll, connected])

  const load = async () => {
    setFailed(false)
    try {
      const data = await apiFetch<{ notifications: NotificationView[]; unread: number }>(
        '/api/v1/notifications',
      )
      setItems(data.notifications)
      setUnread(data.unread)
    } catch {
      setFailed(true)
    }
  }

  const markRead = async (body: { ids: string[] } | { all: true }) => {
    setItems(
      (list) =>
        list?.map((n) => ('all' in body || body.ids.includes(n.id) ? { ...n, read: true } : n)) ??
        null,
    )
    try {
      setUnread((await apiFetch<{ unread: number }>('/api/v1/notifications/read', { body })).unread)
    } catch {
      // The next poll corrects the count.
    }
  }

  return (
    <>
      {live && <LiveUpdates />}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) void load()
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="tertiary"
            size="icon"
            className="relative text-ink-900"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          >
            <Bell aria-hidden="true" className="size-5" />
            {unread > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-xs font-bold text-ink-900"
              >
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent aria-label="Notifications">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
            <h2 className="font-semibold">Notifications</h2>
            {unread > 0 && (
              <Button variant="tertiary" size="sm" onClick={() => markRead({ all: true })}>
                <CheckCheck aria-hidden="true" />
                Mark all read
              </Button>
            )}
          </div>
          <div className="max-h-[min(28rem,70dvh)] overflow-y-auto">
            {failed ? (
              <p className="p-4 text-sm text-danger-700" role="alert">
                Could not load notifications.{' '}
                <button type="button" className="underline" onClick={load}>
                  Try again
                </button>
              </p>
            ) : items === null ? (
              <div className="flex justify-center p-6">
                <Spinner />
              </div>
            ) : items.length === 0 ? (
              <p className="p-6 text-center text-sm text-ink-600">
                Nothing yet. Updates on your bookings appear here.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li key={n.id}>
                    <NotificationItem
                      notification={n}
                      onOpen={() => {
                        setOpen(false)
                        if (!n.read) void markRead({ ids: [n.id] })
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}

export function NotificationItem({
  notification: n,
  onOpen,
}: {
  notification: NotificationView
  onOpen?: () => void
}) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'mt-2 size-2 shrink-0 rounded-full',
          n.read ? 'bg-transparent' : 'bg-brand-600',
        )}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn('text-sm', !n.read && 'font-semibold')}>
          {!n.read && <span className="sr-only">Unread: </span>}
          {n.title}
        </span>
        {n.body && <span className="text-sm text-ink-600">{n.body}</span>}
        <time dateTime={n.createdAt} className="text-xs text-ink-600">
          {formatIstDateTime(new Date(n.createdAt))}
        </time>
      </span>
    </>
  )
  const classes = 'flex gap-3 px-4 py-3'
  return n.link ? (
    <Link href={n.link} onClick={onOpen} className={cn(classes, 'hover:bg-surface-muted')}>
      {content}
    </Link>
  ) : (
    <div className={classes}>{content}</div>
  )
}
