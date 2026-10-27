import { FlaskConical } from 'lucide-react'
import { connection } from 'next/server'
import { getEnv } from '@/config/env'

/**
 * Site-wide notice on a public demo: a production server allowed to simulate OTP,
 * payments and payouts says so on every page (IMPLEMENTATION_PLAN.md §13 honesty rule).
 * Read at request time, so one build serves both a demo and a real deployment.
 */
export async function DemoBanner() {
  await connection()
  const env = getEnv()
  if (env.NODE_ENV !== 'production' || !env.ALLOW_SIMULATION_IN_PRODUCTION) return null
  return (
    <div
      role="note"
      className="flex items-center justify-center gap-2 bg-accent-500 px-4 py-1.5 text-center text-sm font-medium text-ink-900"
    >
      <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
      Demo: sign-in codes, online payments and payouts are simulated. No real money moves.
    </div>
  )
}
