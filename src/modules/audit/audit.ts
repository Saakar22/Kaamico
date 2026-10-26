import 'server-only'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { adminAuditLogs, users } from '@/db/schema'
import { clientIp, userAgent } from '@/lib/request'
import type { Actor } from '@/modules/auth/types'
import type { Tx } from '@/modules/bookings/repo'

/** Where an admin action came from, recorded with it. */
export type AuditContext = { ip: string | null; userAgent: string | null; requestId: string | null }

export function auditContext(request: Request, requestId: string): AuditContext {
  return { ip: clientIp(request), userAgent: userAgent(request), requestId }
}

export type AuditEntry = {
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  reason?: string | null
}

/**
 * Every admin mutation and identity-document view (§10.15). Always called inside the
 * transaction that makes the change, so the change and its audit row commit together.
 * The table is append-only (a trigger refuses updates and deletes).
 */
export async function writeAudit(
  tx: Tx,
  admin: Pick<Actor, 'userId'>,
  context: AuditContext,
  entry: AuditEntry,
): Promise<void> {
  await tx.insert(adminAuditLogs).values({
    adminUserId: admin.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    ip: context.ip,
    userAgent: context.userAgent,
    requestId: context.requestId,
  })
}

export const auditQuery = z.object({
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
})

export type AuditLogView = {
  id: number
  adminName: string
  action: string
  entityType: string
  entityId: string
  before: unknown
  after: unknown
  reason: string | null
  ip: string | null
  createdAt: string
}

const PAGE = 50

/** Read-only: there is no API to change or remove audit rows. */
export async function listAuditLogs(
  raw: unknown,
): Promise<{ logs: AuditLogView[]; page: number; hasMore: boolean }> {
  const q = auditQuery.parse(raw)
  const rows = await getDb()
    .select({
      id: adminAuditLogs.id,
      adminName: sql<string>`coalesce(${users.name}, ${users.email}::text, 'Admin')`,
      action: adminAuditLogs.action,
      entityType: adminAuditLogs.entityType,
      entityId: adminAuditLogs.entityId,
      before: adminAuditLogs.before,
      after: adminAuditLogs.after,
      reason: adminAuditLogs.reason,
      ip: adminAuditLogs.ip,
      createdAt: adminAuditLogs.createdAt,
    })
    .from(adminAuditLogs)
    .innerJoin(users, eq(users.id, adminAuditLogs.adminUserId))
    .where(
      and(
        q.action ? eq(adminAuditLogs.action, q.action) : undefined,
        q.entityType ? eq(adminAuditLogs.entityType, q.entityType) : undefined,
        q.entityId ? eq(adminAuditLogs.entityId, q.entityId) : undefined,
      ),
    )
    .orderBy(desc(adminAuditLogs.id))
    .limit(PAGE + 1)
    .offset((q.page - 1) * PAGE)
  return {
    logs: rows.slice(0, PAGE).map((r) => ({
      ...r,
      ip: r.ip ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    page: q.page,
    hasMore: rows.length > PAGE,
  }
}

/** Distinct actions for the filter menu. */
export async function auditActions(): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ action: adminAuditLogs.action })
    .from(adminAuditLogs)
    .orderBy(adminAuditLogs.action)
  return rows.map((r) => r.action)
}
