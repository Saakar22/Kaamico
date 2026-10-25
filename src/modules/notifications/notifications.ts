import 'server-only'
import { and, count, desc, eq, inArray, isNull, lt } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { notifications } from '@/db/schema'
import { logger } from '@/lib/logger'
import { dispatchOutbox } from './dispatcher'

export type NotificationView = {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  createdAt: string
}

/**
 * Lazy delivery, like lazy expiry: reading notifications first delivers anything pending,
 * so they appear even when no scheduler runs the dispatcher. A failure here never blocks
 * the read; the event stays queued.
 */
export async function deliverPending(): Promise<void> {
  try {
    await dispatchOutbox({ limit: 20 })
  } catch (error) {
    logger.warn({ err: error }, 'lazy outbox delivery failed')
  }
}

/** The user's own notifications, newest first. */
export async function listNotifications(
  userId: string,
  options: { cursor?: string | null; limit?: number } = {},
): Promise<{ notifications: NotificationView[]; nextCursor: string | null; unread: number }> {
  await deliverPending()
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
  // Ids are UUIDv7 (time-ordered), so the last id on a page is the cursor.
  const after = options.cursor && z.uuid().safeParse(options.cursor).success ? options.cursor : null
  const rows = await getDb()
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), after ? lt(notifications.id, after) : undefined))
    .orderBy(desc(notifications.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  return {
    notifications: page.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    })),
    nextCursor: rows.length > limit && last ? last.id : null,
    unread: await countUnread(userId, { deliver: false }),
  }
}

export async function countUnread(
  userId: string,
  options: { deliver?: boolean } = {},
): Promise<number> {
  if (options.deliver !== false) await deliverPending()
  const [row] = await getDb()
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
  return row.n
}

export const markReadInput = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.uuid()).min(1).max(100) }),
])

/** Marks some or all of the user's notifications read; other users' ids are ignored. */
export async function markRead(
  userId: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<{ unread: number }> {
  const input = markReadInput.parse(raw)
  await getDb()
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        'ids' in input ? inArray(notifications.id, input.ids) : undefined,
      ),
    )
  return { unread: await countUnread(userId, { deliver: false }) }
}
