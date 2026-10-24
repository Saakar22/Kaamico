import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

/** Rebuilds the test database from migrations once per test run. Skipped when no test DB is configured. */
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST
  if (!url) return
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await sql.unsafe(`
      drop schema if exists drizzle cascade;
      drop schema if exists public cascade;
      create schema public;
      create extension if not exists pgcrypto;
      create extension if not exists btree_gist;
      create extension if not exists citext;
    `)
    await migrate(drizzle({ client: sql }), { migrationsFolder: 'src/db/migrations' })
  } finally {
    await sql.end()
  }
}
