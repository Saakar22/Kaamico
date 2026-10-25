import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { forbidden, unauthenticated } from '@/lib/errors'
import { readSessionToken, SESSION_COOKIE_PLAIN, SESSION_COOKIE_SECURE } from './cookies'
import { resolveSession } from './sessions'
import { hasRole, type Actor, type Role } from './types'

/**
 * Current user for Server Components, read once per request. Reads cookies, so call it
 * inside a <Suspense> boundary (required with Cache Components).
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE_SECURE)?.value ?? store.get(SESSION_COOKIE_PLAIN)?.value
  return token ? resolveSession(token) : null
})

/** Current user for Route Handlers. */
export async function getActorFromRequest(request: Request): Promise<Actor | null> {
  const token = readSessionToken(request.headers.get('cookie'))
  return token ? resolveSession(token) : null
}

/**
 * Throws 401 when signed out and 403 when the role is missing. Every API handler
 * authorises here, regardless of what the UI shows.
 */
export async function requireApiActor(
  request: Request,
  options: { role?: Role; allowOnboarding?: boolean } = {},
): Promise<Actor> {
  const actor = await getActorFromRequest(request)
  if (!actor) throw unauthenticated()
  if (actor.needsOnboarding && !options.allowOnboarding) {
    throw forbidden('Finish setting up your account first')
  }
  if (options.role && !hasRole(actor, options.role)) throw forbidden()
  return actor
}
