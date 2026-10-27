// Restore drill: restores a backup into a scratch database, checks it against the live
// one (migrations, row counts of the tables that matter, integrity triggers present),
// then drops the scratch database. Run it after setting up backups, and regularly after.
//   npm run db:restore-drill -- [backups/<file>.dump]   (defaults to the newest backup)
// Needs DATABASE_URL (the source) and DATABASE_ADMIN_URL (to create the scratch database).
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { pgTool } from './lib/pg-tools.mjs'
import { targetUrl } from './lib/db-target.mjs'

const TABLES = [
  'users',
  'worker_profiles',
  'bookings',
  'price_offers',
  'payments',
  'refunds',
  'invoices',
  'worker_ledger_entries',
  'reviews',
  'admin_audit_logs',
]
const TRIGGERS = ['bookings_announce', 'reviews_guard', 'refunds_cap']

const { url: sourceUrl, database } = targetUrl()
const adminUrl = process.env.DATABASE_ADMIN_URL
if (!adminUrl) {
  console.error('DATABASE_ADMIN_URL is not set (needed to create the scratch database).')
  process.exit(1)
}
const dir = process.env.BACKUP_DIR ?? 'backups'
const arg = process.argv.slice(2).find((a) => a.endsWith('.dump'))
const file =
  arg ??
  readdirSync(dir)
    .filter((f) => f.startsWith(`${database}-`) && f.endsWith('.dump'))
    .map((f) => path.join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
if (!file) {
  console.error(`No backup of ${database} found in ${dir}. Run npm run db:backup first.`)
  process.exit(1)
}

const scratch = `${database}_restore_drill`
const scratchUrl = new URL(adminUrl)
scratchUrl.pathname = `/${scratch}`
const admin = postgres(adminUrl, { max: 1, onnotice: () => {} })
const counts = async (sql) => {
  const out = {}
  for (const t of TABLES) out[t] = (await sql`select count(*)::int as n from ${sql(t)}`)[0].n
  return out
}

const started = Date.now()
let ok = false
try {
  await admin.unsafe(`drop database if exists "${scratch}"`)
  await admin.unsafe(`create database "${scratch}"`)
  for (const ext of ['pgcrypto', 'btree_gist', 'citext']) {
    const db = postgres(scratchUrl.toString(), { max: 1, onnotice: () => {} })
    await db.unsafe(`create extension if not exists ${ext}`)
    await db.end()
  }
  pgTool('pg_restore', ['--no-owner', '--no-acl', '--exit-on-error', path.basename(file)], {
    dir: path.dirname(file),
    url: scratchUrl.toString(),
  })

  const source = postgres(sourceUrl, { max: 1, onnotice: () => {} })
  const restored = postgres(scratchUrl.toString(), { max: 1, onnotice: () => {} })
  try {
    const [a, b] = await Promise.all([counts(source), counts(restored)])
    const migrations = async (sql) =>
      (await sql`select count(*)::int as n from drizzle.__drizzle_migrations`)[0].n
    const [ma, mb] = await Promise.all([migrations(source), migrations(restored)])
    const triggers =
      await restored`select tgname from pg_trigger where tgname in ${restored(TRIGGERS)}`
    console.log(`restore drill: ${file} → ${scratch}`)
    console.log(`  migrations   source ${ma}, restored ${mb}`)
    for (const t of TABLES) {
      const note = a[t] === b[t] ? '' : `  (differs: writes since the backup?)`
      console.log(
        `  ${t.padEnd(22)} source ${String(a[t]).padStart(6)}, restored ${String(b[t]).padStart(6)}${note}`,
      )
    }
    console.log(`  integrity triggers present: ${triggers.length}/${TRIGGERS.length}`)
    ok = mb === ma && triggers.length === TRIGGERS.length && b.users > 0
  } finally {
    await source.end()
    await restored.end()
  }
} catch (error) {
  console.error(`restore drill failed: ${error.message}`)
} finally {
  await admin.unsafe(`drop database if exists "${scratch}" with (force)`).catch(() => {})
  await admin.end()
}
console.log(`${ok ? 'PASSED' : 'FAILED'} in ${Math.round((Date.now() - started) / 1000)} s`)
process.exitCode = ok ? 0 : 1
