import 'server-only'
import { clearSessionCookie, isSecureOrigin, serializeSessionCookie } from './cookies'
import type { Actor } from './types'

const secure = () => isSecureOrigin(process.env.APP_URL ?? '')

export function setSessionCookie(response: Response, token: string, expiresAt: Date): Response {
  response.headers.append('set-cookie', serializeSessionCookie(token, expiresAt, secure()))
  response.headers.set('cache-control', 'no-store')
  return response
}

export function clearSession(response: Response): Response {
  response.headers.append('set-cookie', clearSessionCookie(secure()))
  response.headers.set('cache-control', 'no-store')
  return response
}

/** The only user fields the browser receives. */
export function publicUser(actor: Actor) {
  return {
    id: actor.userId,
    name: actor.name,
    roles: actor.roles,
    scope: actor.scope,
    needsOnboarding: actor.needsOnboarding,
    workerId: actor.workerId,
  }
}
