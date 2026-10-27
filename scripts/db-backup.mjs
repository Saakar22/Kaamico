// A logical backup of DATABASE_URL in pg_dump's custom format, into ./backups (git-ignored).
// Managed databases also keep point-in-time recovery; this is the portable, nightly copy.
//   npm run db:backup                 (PG_TOOLS_DOCKER=1 to use pg_dump from Docker)
import { mkdirSync } from 'node:fs'
import { pgTool } from './lib/pg-tools.mjs'
import { targetUrl } from './lib/db-target.mjs'

const { url, database } = targetUrl()
const dir = process.env.BACKUP_DIR ?? 'backups'
mkdirSync(dir, { recursive: true })
const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d+Z$/, 'Z')
const file = `${database}-${stamp}.dump`

try {
  // --no-owner/--no-acl: restorable into any role on any host.
  pgTool('pg_dump', ['--format=custom', '--no-owner', '--no-acl', `--file=${file}`], { dir, url })
  console.log(`backup written to ${dir}/${file}`)
} catch (error) {
  console.error(`db:backup failed: ${error.message}`)
  process.exitCode = 1
}
