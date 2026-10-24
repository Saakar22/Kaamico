// Applies pending SQL migrations from src/db/migrations.
//   npm run db:migrate            (DATABASE_URL)
//   npm run db:migrate -- --test  (DATABASE_URL_TEST)
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { targetUrl } from './lib/db-target.mjs'

const { url, database } = targetUrl()
const sql = postgres(url, { max: 1, onnotice: () => {} })
try {
  await migrate(drizzle({ client: sql }), { migrationsFolder: 'src/db/migrations' })
  console.log(`migrations applied to ${database}`)
} catch (error) {
  console.error(`db:migrate failed on ${database}: ${error.message}`)
  process.exitCode = 1
} finally {
  await sql.end()
}
