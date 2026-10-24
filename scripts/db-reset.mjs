// Drops every object in the target database, recreates the extensions and
// re-applies all migrations. Destroys all data in that database.
//   npm run db:reset              (DATABASE_URL, then seeds)
//   node scripts/db-reset.mjs --test
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { refuseInProduction, targetUrl } from './lib/db-target.mjs'

refuseInProduction('reset the database')
const { url, database } = targetUrl()
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
  console.log(`${database} reset and migrated`)
} catch (error) {
  console.error(`db:reset failed on ${database}: ${error.message}`)
  process.exitCode = 1
} finally {
  await sql.end()
}
