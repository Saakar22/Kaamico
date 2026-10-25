import 'server-only'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { adminAuditLogs } from '@/db/schema'
import { AppError, notFound } from '@/lib/errors'
import { createFileToken } from '@/lib/storage/signed-url'
import type { Actor } from '@/modules/auth/types'

/**
 * Issues a 5-minute link to an identity document for an admin, writing a
 * DOCUMENT_VIEWED audit row in the same transaction. Without this, documents
 * are not reachable at all. (The admin review screens arrive in Phase 9.)
 */
export async function documentLinkForAdmin(
  admin: Actor,
  documentId: string,
  context: { ip: string | null; userAgent: string | null; requestId: string },
): Promise<{ url: string; expiresAt: string }> {
  if (!z.uuid().safeParse(documentId).success) throw notFound('Document not found')
  return getDb().transaction(async (tx) => {
    const [doc] = await tx.execute<{
      id: string
      storage_key: string
      mime_type: string
      doc_type: string
      purged_at: Date | null
      application_id: string
    }>(sql`
      select id, storage_key, mime_type, doc_type, purged_at, application_id
      from verification_documents where id = ${documentId}`)
    if (!doc) throw notFound('Document not found')
    if (doc.purged_at) {
      throw new AppError('EXPIRED', 'This document was deleted under the retention policy')
    }
    await tx.insert(adminAuditLogs).values({
      adminUserId: admin.userId,
      action: 'DOCUMENT_VIEWED',
      entityType: 'verification_document',
      entityId: doc.id,
      after: { docType: doc.doc_type, applicationId: doc.application_id },
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
    })
    const { token, expiresAt } = createFileToken({ key: doc.storage_key, mimeType: doc.mime_type })
    return { url: `/api/v1/files/${token}`, expiresAt: expiresAt.toISOString() }
  })
}
