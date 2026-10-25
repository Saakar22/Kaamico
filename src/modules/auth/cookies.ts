/**
 * Session cookie. Over HTTPS it uses the `__Host-` prefix (Secure, Path=/, no Domain),
 * which stops subdomains from setting or overriding it.
 */
export const SESSION_COOKIE_SECURE = '__Host-kmc_session'
export const SESSION_COOKIE_PLAIN = 'kmc_session'

export function sessionCookieName(secure: boolean): string {
  return secure ? SESSION_COOKIE_SECURE : SESSION_COOKIE_PLAIN
}

export function isSecureOrigin(appUrl: string): boolean {
  return appUrl.startsWith('https://')
}

export function serializeSessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  return [
    `${sessionCookieName(secure)}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

export function clearSessionCookie(secure: boolean): string {
  return [
    `${sessionCookieName(secure)}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

/** Reads the session token from a Cookie header (either cookie name). */
export function readSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=')
    if (rawName === SESSION_COOKIE_SECURE || rawName === SESSION_COOKIE_PLAIN) {
      const value = rest.join('=')
      return value || null
    }
  }
  return null
}
