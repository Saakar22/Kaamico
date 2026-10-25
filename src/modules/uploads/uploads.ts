import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, type Database } from '@/db/client'
import { uploads } from '@/db/schema'
import { AppError, businessRule, forbidden, notFound } from '@/lib/errors'
import {
  IMAGE_TYPES,
  InvalidFileError,
  sniffType,
  stripMetadata,
  type SniffedType,
} from '@/lib/files/inspect'
import { enforceRateLimit } from '@/lib/rate-limit'
import { getStorage } from '@/lib/storage'
import { hasRole, type Actor } from '@/modules/auth/types'

const MB = 1024 * 1024
export const MAX_IMAGE_BYTES = 5 * MB
export const MAX_PDF_BYTES = 8 * MB

/** What an upload is for decides who may upload it, what types are allowed and where it lives. */
const PURPOSES = {
  /** Identity documents: a separate prefix so they can be locked down and purged on their own. */
  VERIFICATION_DOCUMENT: { prefix: 'kyc', types: [...IMAGE_TYPES, 'application/pdf'] },
  PROFILE_PHOTO: { prefix: 'photos', types: IMAGE_TYPES },
} as const satisfies Record<string, { prefix: string; types: readonly SniffedType[] }>

export type UploadPurpose = keyof typeof PURPOSES
export const uploadPurposeSchema = z.enum(
  Object.keys(PURPOSES) as [UploadPurpose, ...UploadPurpose[]],
)

export type UploadResult = {
  uploadId: string
  mimeType: SniffedType
  sizeBytes: number
  purpose: UploadPurpose
}

const UPLOAD_LIMIT = { limit: 20, windowSeconds: 60 * 60 }

/**
 * Stores a file privately after checking its real type from its bytes (the file name and
 * the browser's claimed type are ignored) and stripping photo metadata such as GPS.
 */
export async function createUpload(
  actor: Actor,
  input: { bytes: Uint8Array; purpose: UploadPurpose },
): Promise<UploadResult> {
  // Both current purposes belong to a professional's own profile and verification.
  if (!hasRole(actor, 'WORKER') || !actor.workerId) {
    throw forbidden('Only professionals can upload these files')
  }
  const rule = PURPOSES[input.purpose]
  await enforceRateLimit(
    `upload:user:${actor.userId}`,
    UPLOAD_LIMIT,
    'Too many uploads. Please wait a while and try again.',
  )

  const allowed: readonly string[] = rule.types
  const type = sniffType(input.bytes)
  if (!type || !allowed.includes(type)) {
    throw businessRule(
      'UNSUPPORTED_FILE_TYPE',
      allowed.includes('application/pdf')
        ? 'Upload a JPEG, PNG or WebP photo, or a PDF'
        : 'Upload a JPEG, PNG or WebP photo',
    )
  }
  const max = type === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
  if (input.bytes.length > max) throw fileTooLarge(max)

  let clean: Uint8Array
  try {
    clean = stripMetadata(input.bytes, type)
  } catch (error) {
    if (error instanceof InvalidFileError) {
      throw businessRule('INVALID_FILE', 'This file looks damaged. Try another photo.')
    }
    throw error
  }

  const id = randomUUID()
  const key = `${rule.prefix}/${actor.userId}/${id}`
  await getStorage().put(key, clean)
  try {
    await getDb()
      .insert(uploads)
      .values({
        id,
        ownerUserId: actor.userId,
        storageKey: key,
        mimeType: type,
        sizeBytes: clean.length,
        sha256: createHash('sha256').update(clean).digest('hex'),
        purpose: input.purpose,
      })
  } catch (error) {
    await getStorage().delete(key)
    throw error
  }
  return { uploadId: id, mimeType: type, sizeBytes: clean.length, purpose: input.purpose }
}

export function fileTooLarge(maxBytes: number): AppError {
  return new AppError('FILE_TOO_LARGE', `Files can be at most ${maxBytes / MB} MB`, {
    status: 413,
    details: { maxBytes },
  })
}

type Executor = Pick<Database, 'select' | 'update'>

/**
 * Claims an unattached upload of the given purpose for its owner, inside the caller's
 * transaction. Anyone else's upload looks like it does not exist.
 */
export async function claimUpload(
  tx: Executor,
  opts: { uploadId: string; ownerUserId: string; purpose: UploadPurpose },
) {
  if (!z.uuid().safeParse(opts.uploadId).success) throw notFound('Upload not found')
  const [upload] = await tx
    .update(uploads)
    .set({ attachedAt: new Date() })
    .where(
      and(
        eq(uploads.id, opts.uploadId),
        eq(uploads.ownerUserId, opts.ownerUserId),
        eq(uploads.purpose, opts.purpose),
        isNull(uploads.attachedAt),
      ),
    )
    .returning()
  if (!upload) throw notFound('Upload not found or already used')
  return upload
}
