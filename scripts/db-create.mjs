// Creates the application role, the dev and test databases, and required extensions.
// Idempotent. Uses DATABASE_ADMIN_URL (a superuser connection) only for setup.
//
//   npm run db:create
import postgres from 'postgres'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Fall back to variables already in the environment (e.g. CI).
}

const EXTENSIONS = ['pgcrypto', 'btree_gist', 'citext']
const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/

function target(name) {
  const value = process.env[name]
  if (!value) return null
  const url = new URL(value)
  const role = decodeURIComponent(url.username)
  const database = url.pathname.slice(1)
  for (const id of [role, database]) {
    if (!IDENTIFIER.test(id))
      throw new Error(`${name}: "${id}" is not a plain lowercase identifier`)
  }
  return { name, role, password: decodeURIComponent(url.password), database }
}

const adminUrl = process.env.DATABASE_ADMIN_URL
if (!adminUrl) {
  console.error('DATABASE_ADMIN_URL is not set. Add it to .env.local (see .env.example).')
  process.exit(1)
}

const targets = ['DATABASE_URL', 'DATABASE_URL_TEST'].map(target).filter(Boolean)
if (targets.length === 0) {
  console.error('Neither DATABASE_URL nor DATABASE_URL_TEST is set.')
  process.exit(1)
}

const quoteLiteral = (value) => `'${value.replaceAll("'", "''")}'`
const admin = postgres(adminUrl, { max: 1, onnotice: () => {} })

try {
  for (const t of targets) {
    const [role] = await admin`select 1 from pg_roles where rolname = ${t.role}`
    if (!role) {
      if (!t.password)
        throw new Error(`${t.name}: a password is required to create role "${t.role}"`)
      await admin.unsafe(`create role ${t.role} login password ${quoteLiteral(t.password)}`)
      console.log(`created role ${t.role}`)
    }

    const [db] = await admin`select 1 from pg_database where datname = ${t.database}`
    if (!db) {
      await admin.unsafe(`create database ${t.database} owner ${t.role} encoding 'UTF8'`)
      console.log(`created database ${t.database}`)
    } else {
      console.log(`database ${t.database} already exists`)
    }

    const dbUrl = new URL(adminUrl)
    dbUrl.pathname = `/${t.database}`
    const conn = postgres(dbUrl.toString(), { max: 1, onnotice: () => {} })
    try {
      for (const ext of EXTENSIONS) await conn.unsafe(`create extension if not exists ${ext}`)
      await conn.unsafe(`grant all on schema public to ${t.role}`)
      console.log(`  extensions ready in ${t.database}: ${EXTENSIONS.join(', ')}`)
    } finally {
      await conn.end()
    }
  }
} catch (error) {
  console.error(`db:create failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await admin.end()
}
