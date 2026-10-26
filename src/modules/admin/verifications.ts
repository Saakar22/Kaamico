import 'server-only'
import { and, eq, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import {
  outboxEvents,
  uploads,
  verificationApplications,
  verificationDocuments,
  workerProfiles,
} from '@/db/schema'
import { conflict, notFound } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { getStorage } from '@/lib/storage'
import { writeAudit, type AuditContext } from '@/modules/audit/audit'
import type { Actor } from '@/modules/auth/types'

const DAY = 86_400_000
/** Identity files are deleted this long after a final decision [Assume; legal review]. */
export const DOCUMENT_RETENTION_DAYS = 90
const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null)

export const QUEUE_TABS = ['pending', 'resubmission', 'approved', 'rejected'] as const
export type QueueTab = (typeof QUEUE_TABS)[number]

const TAB_STATUS: Record<QueueTab, string[]> = {
  pending: ['SUBMITTED', 'UNDER_REVIEW'],
  resubmission: ['RESUBMISSION_REQUESTED'],
  approved: ['APPROVED'],
  rejected: ['REJECTED'],
}

export type QueueItem = {
  id: string
  status: string
  attempt: number
  submittedAt: string | null
  reviewedAt: string | null
  workerId: string
  workerName: string
  phone: string | null
  city: string | null
  skills: string[]
  documentCount: number
}

const PAGE = 25

/** The review queue: pending applications oldest first, decided ones newest first. */
export async function listVerificationQueue(
  tab: QueueTab,
  page = 1,
): Promise<{ items: QueueItem[]; page: number; hasMore: boolean }> {
  const pending = tab === 'pending'
  const rows = await getDb().execute<{
    id: string
    status: string
    attempt: number
    submitted_at: Date | string | null
    reviewed_at: Date | string | null
    worker_id: string
    worker_name: string
    phone: string | null
    city: string | null
    skills: string[] | null
    document_count: number
  }>(sql`
    select a.id, a.status, a.attempt, a.submitted_at, a.reviewed_at, w.id as worker_id,
           w.display_name as worker_name, u.phone, l.city,
           (select array_agg(c.name order by c.sort_order) from worker_skills ws
              join service_categories c on c.id = ws.category_id where ws.worker_id = w.id) as skills,
           (select count(*)::int from verification_documents d where d.application_id = a.id) as document_count
    from verification_applications a
    join worker_profiles w on w.id = a.worker_id
    join users u on u.id = w.user_id
    left join localities l on l.id = w.base_locality_id
    where a.status::text in ${sql.raw(`('${TAB_STATUS[tab].join("','")}')`)}
    order by ${pending ? sql`a.submitted_at asc nulls last` : sql`a.reviewed_at desc nulls last`}, a.id
    limit ${PAGE + 1} offset ${(page - 1) * PAGE}`)
  return {
    items: rows.slice(0, PAGE).map((r) => ({
      id: r.id,
      status: r.status,
      attempt: r.attempt,
      submittedAt: iso(r.submitted_at),
      reviewedAt: iso(r.reviewed_at),
      workerId: r.worker_id,
      workerName: r.worker_name,
      phone: r.phone,
      city: r.city,
      skills: r.skills ?? [],
      documentCount: r.document_count,
    })),
    page,
    hasMore: rows.length > PAGE,
  }
}

export async function countPendingVerifications(): Promise<number> {
  const [row] = await getDb().execute<{ n: number }>(sql`
    select count(*)::int as n from verification_applications
    where status in ('SUBMITTED', 'UNDER_REVIEW')`)
  return row.n
}

export type AdminDocument = {
  id: string
  docType: string
  idLast4: string | null
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  purgeAfter: string | null
  purgedAt: string | null
  /** Uploaded after the previous decision (what changed on a resubmission). */
  isNew: boolean
}

/** Everything a reviewer needs; document files themselves only through signed links. */
export async function getApplicationForAdmin(applicationId: string) {
  if (!z.uuid().safeParse(applicationId).success) throw notFound('Application not found')
  const db = getDb()
  const [app] = await db.execute<{
    id: string
    status: string
    attempt: number
    version: number
    submitted_at: Date | string | null
    reviewed_at: Date | string | null
    decision_reason: string | null
    reviewer_name: string | null
    worker_id: string
    user_id: string
    display_name: string
    phone: string | null
    user_status: string
    bio: string | null
    languages: string[]
    years_experience: number | null
    has_photo: boolean
    worker_status: string
    locality: string | null
    city: string | null
    radius_km: number
    joined_at: Date | string
    skills: string[] | null
  }>(sql`
    select a.id, a.status, a.attempt, a.version, a.submitted_at, a.reviewed_at, a.decision_reason,
           r.name as reviewer_name, w.id as worker_id, u.id as user_id, w.display_name, u.phone,
           u.status as user_status, w.bio, w.languages, w.years_experience,
           (w.photo_key is not null) as has_photo, w.verification_status as worker_status,
           l.name as locality, l.city, w.service_radius_km::float as radius_km, u.created_at as joined_at,
           (select array_agg(c.name order by c.sort_order) from worker_skills ws
              join service_categories c on c.id = ws.category_id where ws.worker_id = w.id) as skills
    from verification_applications a
    join worker_profiles w on w.id = a.worker_id
    join users u on u.id = w.user_id
    left join users r on r.id = a.reviewer_admin_id
    left join localities l on l.id = w.base_locality_id
    where a.id = ${applicationId}`)
  if (!app) throw notFound('Application not found')

  const [docs, history, trail] = await Promise.all([
    db
      .select()
      .from(verificationDocuments)
      .where(eq(verificationDocuments.applicationId, app.id))
      .orderBy(verificationDocuments.uploadedAt),
    db.execute<{
      id: string
      attempt: number
      status: string
      submitted_at: Date | string | null
      reviewed_at: Date | string | null
      decision_reason: string | null
    }>(sql`
      select id, attempt, status, submitted_at, reviewed_at, decision_reason
      from verification_applications where worker_id = ${app.worker_id} and id <> ${app.id}
      order by created_at desc`),
    db.execute<{
      action: string
      admin_name: string
      created_at: Date | string
      reason: string | null
    }>(sql`
      select l.action, coalesce(u.name, u.email::text) as admin_name, l.created_at, l.reason
      from admin_audit_logs l join users u on u.id = l.admin_user_id
      where (l.entity_type = 'verification_application' and l.entity_id = ${app.id})
         or (l.entity_type = 'verification_document' and l.entity_id in (
              select id::text from verification_documents where application_id = ${app.id}))
      order by l.id desc
      limit 50`),
  ])

  // On a resubmission, the previous decision is the cut-off for "new" documents.
  const lastDecision =
    app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW' ? app.reviewed_at : null
  const since = lastDecision ? new Date(lastDecision).getTime() : 0
  return {
    id: app.id,
    status: app.status,
    attempt: app.attempt,
    version: app.version,
    submittedAt: iso(app.submitted_at),
    reviewedAt: iso(app.reviewed_at),
    decisionReason: app.decision_reason,
    reviewerName: app.reviewer_name,
    decidable: app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW',
    worker: {
      id: app.worker_id,
      userId: app.user_id,
      displayName: app.display_name,
      phone: app.phone,
      userStatus: app.user_status,
      bio: app.bio,
      languages: app.languages,
      yearsExperience: app.years_experience,
      photoUrl: app.has_photo ? `/api/v1/admin/workers/${app.worker_id}/photo` : null,
      verificationStatus: app.worker_status,
      area: app.locality ? `${app.locality}, ${app.city}` : null,
      radiusKm: app.radius_km,
      joinedAt: iso(app.joined_at)!,
      skills: app.skills ?? [],
    },
    documents: docs.map<AdminDocument>((d) => ({
      id: d.id,
      docType: d.docType,
      idLast4: d.idLast4,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      uploadedAt: d.uploadedAt.toISOString(),
      purgeAfter: iso(d.purgeAfter),
      purgedAt: iso(d.purgedAt),
      isNew: since > 0 && d.uploadedAt.getTime() > since,
    })),
    previous: history.map((h) => ({
      id: h.id,
      attempt: h.attempt,
      status: h.status,
      submittedAt: iso(h.submitted_at),
      reviewedAt: iso(h.reviewed_at),
      decisionReason: h.decision_reason,
    })),
    trail: trail.map((t) => ({
      action: t.action,
      adminName: t.admin_name,
      reason: t.reason,
      at: iso(t.created_at)!,
    })),
  }
}

export type AdminApplicationView = Awaited<ReturnType<typeof getApplicationForAdmin>>

export const decisionInput = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_RESUBMISSION']),
    reason: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => v || undefined),
    expectedVersion: z.number().int().positive(),
  })
  .superRefine((d, ctx) => {
    if (d.decision !== 'APPROVE' && (d.reason?.length ?? 0) < 10) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Explain what the professional should fix (at least 10 characters)',
      })
    }
  })

const OUTCOME = {
  APPROVE: { application: 'APPROVED', worker: 'VERIFIED', action: 'VERIFICATION_APPROVED' },
  REJECT: { application: 'REJECTED', worker: 'REJECTED', action: 'VERIFICATION_REJECTED' },
  // Back to the worker to add documents; they are unverified until they resubmit.
  REQUEST_RESUBMISSION: {
    application: 'RESUBMISSION_REQUESTED',
    worker: 'UNVERIFIED',
    action: 'VERIFICATION_RESUBMISSION_REQUESTED',
  },
} as const

/**
 * Decides an application (§4.4 step 5) in one transaction: application, worker status,
 * document retention, audit row and an outbox event for the professional's notification.
 * The version check stops two admins deciding the same application.
 */
export async function decideVerification(
  admin: Actor,
  applicationId: string,
  raw: unknown,
  context: AuditContext,
  now: Date = new Date(),
) {
  const input = decisionInput.parse(raw)
  if (!z.uuid().safeParse(applicationId).success) throw notFound('Application not found')
  const outcome = OUTCOME[input.decision]
  return getDb().transaction(async (tx) => {
    const [app] = await tx
      .select()
      .from(verificationApplications)
      .where(eq(verificationApplications.id, applicationId))
      .for('update')
    if (!app) throw notFound('Application not found')
    if (app.status !== 'SUBMITTED' && app.status !== 'UNDER_REVIEW') {
      throw conflict('ALREADY_DECIDED', 'This application has already been decided', {
        status: app.status,
      })
    }
    if (app.version !== input.expectedVersion) {
      throw conflict('STALE_VERSION', 'Someone else changed this application. Reload it.')
    }
    const reason = input.decision === 'APPROVE' ? null : input.reason!
    await tx
      .update(verificationApplications)
      .set({
        status: outcome.application,
        reviewerAdminId: admin.userId,
        reviewedAt: now,
        decisionReason: reason,
        version: app.version + 1,
      })
      .where(eq(verificationApplications.id, app.id))
    await tx
      .update(workerProfiles)
      .set({
        verificationStatus: outcome.worker,
        // Unverified professionals cannot take requests, so they go offline.
        ...(outcome.worker === 'VERIFIED' ? {} : { isOnline: false }),
        version: sql`${workerProfiles.version} + 1`,
      })
      .where(eq(workerProfiles.id, app.workerId))
    if (input.decision !== 'REQUEST_RESUBMISSION') {
      await tx
        .update(verificationDocuments)
        .set({ purgeAfter: new Date(now.getTime() + DOCUMENT_RETENTION_DAYS * DAY) })
        .where(eq(verificationDocuments.applicationId, app.id))
    }
    await writeAudit(tx, admin, context, {
      action: outcome.action,
      entityType: 'verification_application',
      entityId: app.id,
      before: { status: app.status },
      after: { status: outcome.application, workerStatus: outcome.worker },
      reason,
    })
    await tx.insert(outboxEvents).values({
      topic: 'verification.decided',
      payload: { applicationId: app.id, workerId: app.workerId, decision: input.decision },
    })
    return { applicationId: app.id, status: outcome.application, version: app.version + 1 }
  })
}

/**
 * Retention: deletes identity files whose `purge_after` has passed. Metadata and the
 * decision stay. Runs from the sweeper; a storage failure leaves the row for next time.
 */
export async function purgeDueDocuments(
  now: Date = new Date(),
  limit = 100,
): Promise<{ purged: number }> {
  const due = await getDb()
    .select({ id: verificationDocuments.id, key: verificationDocuments.storageKey })
    .from(verificationDocuments)
    .where(and(lte(verificationDocuments.purgeAfter, now), isNull(verificationDocuments.purgedAt)))
    .limit(limit)
  let purged = 0
  for (const doc of due) {
    try {
      await getStorage().delete(doc.key)
    } catch (error) {
      logger.warn({ err: error, documentId: doc.id }, 'document purge failed')
      continue
    }
    await getDb().transaction(async (tx) => {
      await tx
        .update(verificationDocuments)
        .set({ purgedAt: now })
        .where(eq(verificationDocuments.id, doc.id))
      await tx.delete(uploads).where(eq(uploads.storageKey, doc.key))
    })
    purged++
  }
  return { purged }
}
