/**
 * Accepts only same-site relative paths for post-login redirects, so `?next=`
 * cannot send users to another site (open redirect).
 */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\'))
    return fallback
  try {
    const url = new URL(next, 'http://kaamico.local')
    if (url.origin !== 'http://kaamico.local') return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}

/** Where a signed-in user lands by default. */
export function homePathFor(user: { roles: readonly string[]; needsOnboarding: boolean }): string {
  if (user.needsOnboarding) return '/login?step=details'
  return user.roles.includes('WORKER') ? '/worker/dashboard' : '/dashboard'
}
