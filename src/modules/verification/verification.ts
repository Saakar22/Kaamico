import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, type Database } from '@/db/client'
import {
  outboxEvents,
  uploads,
  verificationApplications,
  verificationDocuments,
  workerProfiles,
} from '@/db/schema'
import { businessRule, conflict, forbidden, notFound } from '@/lib/errors'
import { getStorage } from '@/lib/storage'
import type { Actor } from '@/modules/auth/types'
import { claimUpload } from '@/modules/uploads/uploads'
import { workerIdOf } from '@/modules/workers/profile'

export const MAX_DOCUMENTS = 6
export const REAPPLY_AFTER_DAYS = 7

export const ID_DOCUMENT_TYPES = ['AADHAAR_MASKED', 'PAN', 'VOTER_ID', 'DRIVING_LICENCE'] as const
export const DOCUMENT_TYPES = [
  ...ID_DOCUMENT_TYPES,
  'SELFIE',
  'SKILL_CERTIFICATE',
  'POLICE_VERIFICATION',
] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

type ApplicationStatus =
  'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'RESUBMISSION_REQUESTED'

/** Metadata only: storage keys and file contents never leave the server. */
export type DocumentMeta = {
  id: string
  docType: DocumentType
  idLast4: string | null
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  /** Added since the last review decision (removable while editing). */
  isNew: boolean
}

export type Requirement = {
  key: 'profile' | 'skills' | 'area' | 'idDocument' | 'selfie'
  done: boolean
}

export type VerificationState = {
  workerStatus: string
  application: {
    id: string
    status: ApplicationStatus
    attempt: number
    submittedAt: string | null
    reviewedAt: string | null
    decisionReason: string | null
  } | null
  documents: DocumentMeta[]
  requirements: Requirement[]
  canEdit: boolean
  canSubmit: boolean
  /** After a rejection, when a new application can be started. */
  canReapplyAt: string | null
}

const EDITABLE: ApplicationStatus[] = ['DRAFT', 'RESUBMISSION_REQUESTED']
const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null)

type Executor = Pick<Database, 'execute' | 'select' | 'insert' | 'update' | 'delete'>

async function latestApplication(db: Executor, workerId: string, lock = false) {
  const [app] = await db.execute<{
    id: string
    status: ApplicationStatus
    attempt: number
    submitted_at: Date | string | null
    reviewed_at: Date | string | null
    decision_reason: string | null
  }>(sql`
    select id, status, attempt, submitted_at, reviewed_at, decision_reason
    from verification_applications where worker_id = ${workerId}
    order by created_at desc, attempt desc limit 1
    ${lock ? sql`for update` : sql``}`)
  return app ?? null
}

/** Profile, skills and service area: what an admin needs before reviewing. */
async function profileRequirements(db: Executor, workerId: string) {
  const [row] = await db.execute<{ profile: boolean; skills: boolean; area: boolean }>(sql`
    select (w.bio is not null and cardinality(w.languages) > 0) as profile,
           exists (select 1 from worker_skills s where s.worker_id = w.id) as skills,
           (w.base_lat is not null) as area
    from worker_profiles w where w.id = ${workerId}`)
  return row
}

async function documentsOf(
  db: Executor,
  applicationId: string,
  reviewedAt: Date | string | null,
): Promise<DocumentMeta[]> {
  const rows = await db
    .select({
      id: verificationDocuments.id,
      docType: verificationDocuments.docType,
      idLast4: verificationDocuments.idLast4,
      mimeType: verificationDocuments.mimeType,
      sizeBytes: verificationDocuments.sizeBytes,
      uploadedAt: verificationDocuments.uploadedAt,
    })
    .from(verificationDocuments)
    .where(eq(verificationDocuments.applicationId, applicationId))
    .orderBy(verificationDocuments.uploadedAt)
  const since = reviewedAt ? new Date(reviewedAt).getTime() : 0
  return rows.map((d) => ({
    ...d,
    uploadedAt: d.uploadedAt.toISOString(),
    isNew: d.uploadedAt.getTime() > since,
  }))
}

function reapplyAt(app: { status: ApplicationStatus; reviewed_at: Date | string | null }) {
  if (app.status !== 'REJECTED' || !app.reviewed_at) return null
  return new Date(new Date(app.reviewed_at).getTime() + REAPPLY_AFTER_DAYS * 86_400_000)
}

export async function getVerification(
  workerId: string,
  now: Date = new Date(),
): Promise<VerificationState> {
  const db = getDb()
  const [worker] = await db
    .select({ status: workerProfiles.verificationStatus })
    .from(workerProfiles)
    .where(eq(workerProfiles.id, workerId))
  const app = await latestApplication(db, workerId)
  const documents = app ? await documentsOf(db, app.id, app.reviewed_at) : []
  const profile = await profileRequirements(db, workerId)

  // On a resubmission, the admin asked for new documents: count only those.
  const current =
    app?.status === 'RESUBMISSION_REQUESTED' ? documents.filter((d) => d.isNew) : documents
  const requirements: Requirement[] = [
    { key: 'profile', done: profile.profile },
    { key: 'skills', done: profile.skills },
    { key: 'area', done: profile.area },
    {
      key: 'idDocument',
      done: current.some((d) => (ID_DOCUMENT_TYPES as readonly string[]).includes(d.docType)),
    },
    { key: 'selfie', done: documents.some((d) => d.docType === 'SELFIE') },
  ]
  const until = app ? reapplyAt(app) : null
  const startable =
    worker.status !== 'VERIFIED' &&
    worker.status !== 'SUSPENDED' &&
    (!app || (app.status === 'REJECTED' && until !== null && until <= now))
  const canEdit =
    worker.status !== 'SUSPENDED' && (startable || (app !== null && EDITABLE.includes(app.status)))
  return {
    workerStatus: worker.status,
    application: app
      ? {
          id: app.id,
          status: app.status,
          attempt: app.attempt,
          submittedAt: iso(app.submitted_at),
          reviewedAt: iso(app.reviewed_at),
          decisionReason: app.decision_reason,
        }
      : null,
    // A rejected application's files are not part of the next attempt.
    documents: app?.status === 'REJECTED' ? [] : documents,
    requirements,
    canEdit,
    canSubmit:
      canEdit && app !== null && EDITABLE.includes(app.status) && requirements.every((r) => r.done),
    canReapplyAt: until && until > now ? until.toISOString() : null,
  }
}

/** The application documents can be added to, creating a fresh draft when allowed. */
async function editableApplication(tx: Executor, workerId: string, now: Date) {
  await tx.execute(sql`select 1 from worker_profiles where id = ${workerId} for update`)
  const [worker] = await tx
    .select({ status: workerProfiles.verificationStatus })
    .from(workerProfiles)
    .where(eq(workerProfiles.id, workerId))
  if (worker.status === 'VERIFIED')
    throw conflict('ALREADY_VERIFIED', 'Your ID is already verified')
  if (worker.status === 'SUSPENDED') throw forbidden('Your account is suspended')

  const app = await latestApplication(tx, workerId, true)
  if (app && EDITABLE.includes(app.status)) return app
  if (app && (app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW')) {
    throw conflict('UNDER_REVIEW', 'Your documents are being reviewed. You cannot change them now.')
  }
  if (app?.status === 'REJECTED') {
    const until = reapplyAt(app)!
    if (until > now) {
      throw businessRule('REAPPLY_LATER', 'You can apply again after the waiting period', {
        canReapplyAt: until.toISOString(),
      })
    }
  }
  const [created] = await tx
    .insert(verificationApplications)
    .values({ workerId, attempt: (app?.attempt ?? 0) + 1 })
    .returning()
  return {
    id: created.id,
    status: created.status as ApplicationStatus,
    attempt: created.attempt,
    submitted_at: null,
    reviewed_at: null,
    decision_reason: null,
  }
}

const last4 = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9A-Z]{4}$/, 'Enter exactly the last 4 characters')

export const addDocumentInput = z
  .object({
    uploadId: z.uuid(),
    docType: z.enum(DOCUMENT_TYPES),
    idLast4: last4.optional(),
  })
  .superRefine((d, ctx) => {
    const isId = (ID_DOCUMENT_TYPES as readonly string[]).includes(d.docType)
    if (isId && !d.idLast4) {
      ctx.addIssue({
        code: 'custom',
        path: ['idLast4'],
        message: 'Enter the last 4 characters of the ID number',
      })
    }
    if (!isId && d.idLast4) {
      ctx.addIssue({
        code: 'custom',
        path: ['idLast4'],
        message: 'Only ID documents have a number',
      })
    }
  })

export async function addDocument(
  actor: Actor,
  raw: unknown,
  now: Date = new Date(),
): Promise<DocumentMeta> {
  const workerId = workerIdOf(actor)
  const input = addDocumentInput.parse(raw)
  return getDb().transaction(async (tx) => {
    const app = await editableApplication(tx, workerId, now)
    const existing = await documentsOf(tx, app.id, app.reviewed_at)
    if (existing.filter((d) => d.isNew).length >= MAX_DOCUMENTS) {
      throw businessRule('TOO_MANY_DOCUMENTS', `You can add up to ${MAX_DOCUMENTS} documents`)
    }
    const upload = await claimUpload(tx, {
      uploadId: input.uploadId,
      ownerUserId: actor.userId,
      purpose: 'VERIFICATION_DOCUMENT',
    })
    if (input.docType === 'SELFIE' && upload.mimeType === 'application/pdf') {
      throw businessRule('SELFIE_MUST_BE_PHOTO', 'Your selfie must be a photo, not a PDF')
    }
    const [doc] = await tx
      .insert(verificationDocuments)
      .values({
        applicationId: app.id,
        docType: input.docType,
        idLast4: input.idLast4 ?? null,
        storageKey: upload.storageKey,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        sha256: upload.sha256,
      })
      .returning()
    return {
      id: doc.id,
      docType: doc.docType,
      idLast4: doc.idLast4,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      uploadedAt: doc.uploadedAt.toISOString(),
      isNew: true,
    }
  })
}

/** Removes a document added since the last review, while the application can still be edited. */
export async function removeDocument(actor: Actor, documentId: string): Promise<void> {
  const workerId = workerIdOf(actor)
  if (!z.uuid().safeParse(documentId).success) throw notFound('Document not found')
  const key = await getDb().transaction(async (tx) => {
    const [doc] = await tx.execute<{
      id: string
      storage_key: string
      app_status: ApplicationStatus
      uploaded_at: Date | string
      reviewed_at: Date | string | null
    }>(sql`
      select d.id, d.storage_key, a.status as app_status, d.uploaded_at, a.reviewed_at
      from verification_documents d
      join verification_applications a on a.id = d.application_id
      where d.id = ${documentId} and a.worker_id = ${workerId}
      for update of a`)
    if (!doc) throw notFound('Document not found')
    const addedSinceReview =
      !doc.reviewed_at || new Date(doc.uploaded_at) > new Date(doc.reviewed_at)
    if (!EDITABLE.includes(doc.app_status) || !addedSinceReview) {
      throw conflict('DOCUMENT_LOCKED', 'This document has been submitted and cannot be removed')
    }
    await tx.delete(verificationDocuments).where(eq(verificationDocuments.id, documentId))
    await tx.delete(uploads).where(eq(uploads.storageKey, doc.storage_key))
    return doc.storage_key
  })
  await getStorage().delete(key)
}

/**
 * Sends the application for review: SUBMITTED, the worker becomes PENDING, and an
 * outbox event is written in the same transaction (admin notification, Phase 8/9).
 */
export async function submitApplication(
  actor: Actor,
  now: Date = new Date(),
): Promise<VerificationState> {
  const workerId = workerIdOf(actor)
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select 1 from worker_profiles where id = ${workerId} for update`)
    const app = await latestApplication(tx, workerId, true)
    if (!app || !EDITABLE.includes(app.status)) {
      throw conflict('NOTHING_TO_SUBMIT', 'Add your documents before submitting')
    }
    const [worker] = await tx
      .select({ status: workerProfiles.verificationStatus })
      .from(workerProfiles)
      .where(eq(workerProfiles.id, workerId))
    if (worker.status === 'SUSPENDED') throw forbidden('Your account is suspended')

    const state = await getVerification(workerId, now)
    const missing = state.requirements.filter((r) => !r.done).map((r) => r.key)
    if (missing.length > 0) {
      throw businessRule(
        'VERIFICATION_INCOMPLETE',
        'Finish the remaining steps before submitting',
        { missing },
      )
    }
    const resubmission = app.status === 'RESUBMISSION_REQUESTED'
    await tx
      .update(verificationApplications)
      .set({
        status: 'SUBMITTED',
        submittedAt: now,
        ...(resubmission ? { attempt: app.attempt + 1 } : {}),
        version: sql`${verificationApplications.version} + 1`,
      })
      .where(
        and(
          eq(verificationApplications.id, app.id),
          eq(verificationApplications.status, app.status),
        ),
      )
    await tx
      .update(workerProfiles)
      .set({ verificationStatus: 'PENDING', version: sql`${workerProfiles.version} + 1` })
      .where(eq(workerProfiles.id, workerId))
    await tx.insert(outboxEvents).values({
      topic: 'verification.submitted',
      payload: { applicationId: app.id, workerId, resubmission },
    })
  })
  return getVerification(workerId, now)
}
