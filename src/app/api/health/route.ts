import { connection } from 'next/server'
import { getSql } from '@/db/client'
import { route } from '@/lib/http'
import { logger } from '@/lib/logger'

type DbHealth = { status: 'up'; latencyMs: number } | { status: 'down'; reason: string }

async function checkDatabase(): Promise<DbHealth> {
  const started = performance.now()
  try {
    await getSql()`select 1`
    return { status: 'up', latencyMs: Math.round(performance.now() - started) }
  } catch (error) {
    logger.warn({ err: error }, 'health check: database unavailable')
    // Postgres SQLSTATE (e.g. 28P01 = bad password) is safe to expose; messages are not.
    const code = (error as { code?: unknown }).code
    return { status: 'down', reason: typeof code === 'string' ? code : 'unavailable' }
  }
}

export const GET = route(async () => {
  await connection()
  const db = await checkDatabase()
  return Response.json(
    { status: db.status === 'up' ? 'ok' : 'degraded', db, time: new Date().toISOString() },
    { status: db.status === 'up' ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  )
})
