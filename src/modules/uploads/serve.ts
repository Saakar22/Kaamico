import 'server-only'
import { sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { AppError } from '@/lib/errors'
import { getStorage } from '@/lib/storage'

export type StoredFile = { key: string; mimeType: string }

/**
 * Sends a stored file. The headers stop browsers from guessing a different type or
 * running anything inside it, even if a crafted file got through.
 */
export async function serveFile(file: StoredFile, cacheControl: string): Promise<Response> {
  const bytes = await getStorage().get(file.key)
  if (!bytes) throw new AppError('EXPIRED', 'This file is no longer available', { status: 410 })
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      'content-type': file.mimeType,
      'content-length': String(bytes.length),
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'same-origin',
      'referrer-policy': 'no-referrer',
      'cache-control': cacheControl,
    },
  })
}

type PhotoRow = { photo_key: string | null; mime_type: string | null }

const toFile = (row: PhotoRow | undefined): StoredFile | null =>
  row?.photo_key && row.mime_type ? { key: row.photo_key, mimeType: row.mime_type } : null

/** The professional's own photo, whatever their verification status. */
export async function ownPhoto(workerId: string): Promise<StoredFile | null> {
  const [row] = await getDb().execute<PhotoRow>(sql`
    select w.photo_key, up.mime_type from worker_profiles w
    left join uploads up on up.storage_key = w.photo_key
    where w.id = ${workerId}`)
  return toFile(row)
}

/** A photo anyone may see: only for professionals whose profile is public. */
export async function publicPhoto(workerId: string): Promise<StoredFile | null> {
  const [row] = await getDb().execute<PhotoRow>(sql`
    select w.photo_key, up.mime_type from worker_profiles w
    join users u on u.id = w.user_id
    left join uploads up on up.storage_key = w.photo_key
    where w.id = ${workerId} and w.verification_status = 'VERIFIED'
      and u.status = 'ACTIVE' and u.deleted_at is null`)
  return toFile(row)
}

/** Public URL for a profile photo; the version busts caches when the photo changes. */
export function photoUrl(workerId: string, photoKey: string | null): string | null {
  return photoKey ? `/api/v1/professionals/${workerId}/photo?v=${photoKey.slice(-8)}` : null
}
