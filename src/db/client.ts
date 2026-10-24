import 'server-only'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getEnv } from '@/config/env'
import * as schema from './schema/index.ts'

export type Database = PostgresJsDatabase<typeof schema>

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as {
  kaamicoSql?: postgres.Sql
  kaamicoDb?: Database
}

export function getSql(): postgres.Sql {
  globalForDb.kaamicoSql ??= postgres(getEnv().DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 5,
  })
  return globalForDb.kaamicoSql
}

export function getDb(): Database {
  globalForDb.kaamicoDb ??= drizzle({ client: getSql(), schema, casing: 'snake_case' })
  return globalForDb.kaamicoDb
}
