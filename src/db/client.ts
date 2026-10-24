import 'server-only'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getEnv } from '@/config/env'

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as {
  kaamicoSql?: postgres.Sql
  kaamicoDb?: PostgresJsDatabase
}

export function getSql(): postgres.Sql {
  globalForDb.kaamicoSql ??= postgres(getEnv().DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 5,
  })
  return globalForDb.kaamicoSql
}

export function getDb(): PostgresJsDatabase {
  globalForDb.kaamicoDb ??= drizzle({ client: getSql() })
  return globalForDb.kaamicoDb
}
