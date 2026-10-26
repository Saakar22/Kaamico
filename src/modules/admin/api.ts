import 'server-only'
import { requireApiActor } from '@/modules/auth/actor'
import type { Actor } from '@/modules/auth/types'

/** Every /api/v1/admin handler: an admin session from the admin sign-in. */
export function requireAdmin(request: Request): Promise<Actor> {
  return requireApiActor(request, { role: 'ADMIN' })
}

/** Query string as a plain object for zod (empty values dropped). */
export function searchParams(request: Request): Record<string, string> {
  return Object.fromEntries(
    [...new URL(request.url).searchParams].filter(([, value]) => value !== ''),
  )
}

export const noStore = { 'cache-control': 'no-store' }
