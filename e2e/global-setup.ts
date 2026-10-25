import type { FullConfig } from '@playwright/test'

// `next dev` compiles each route on its first request. Compiling them one at a time
// before parallel tests start avoids cold-start timeouts. Production builds skip this.
const ROUTES = [
  '/',
  '/login',
  '/admin/login',
  '/dashboard',
  '/worker/dashboard',
  '/admin',
  '/dev/ui',
  '/dev/shells/customer',
  '/api/health',
]

export default async function globalSetup(config: FullConfig) {
  if (process.env.E2E_SKIP_WARMUP) return
  const baseURL = config.projects[0]?.use.baseURL
  if (!baseURL) return
  for (const path of ROUTES) {
    try {
      await fetch(baseURL + path, { redirect: 'manual', signal: AbortSignal.timeout(60_000) })
    } catch {
      // Warm-up is best effort; the tests report real failures.
    }
  }
}
