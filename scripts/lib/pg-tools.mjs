// Runs pg_dump / pg_restore: installed ones, or (PG_TOOLS_DOCKER=1) the postgres:18.0
// image, so a machine without PostgreSQL client tools can still take and test backups.
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const IMAGE = 'postgres:18.0'

function dockerised() {
  return process.env.PG_TOOLS_DOCKER === '1'
}

/** Inside Docker, "localhost" means the container; reach the host instead. */
function forDocker(url) {
  const u = new URL(url)
  if (['localhost', '127.0.0.1'].includes(u.hostname)) u.hostname = 'host.docker.internal'
  return u.toString()
}

/**
 * Runs a PostgreSQL client tool. `dir` is a host folder made available to the tool (as
 * /work under Docker); file arguments are given relative to it.
 */
export function pgTool(tool, args, { dir, url }) {
  const result = dockerised()
    ? spawnSync(
        'docker',
        [
          'run',
          '--rm',
          '-v',
          `${path.resolve(dir)}:/work`,
          '-w',
          '/work',
          IMAGE,
          tool,
          `--dbname=${forDocker(url)}`,
          ...args,
        ],
        { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
      )
    : spawnSync(tool, [`--dbname=${url}`, ...args], {
        cwd: dir,
        stdio: ['ignore', 'inherit', 'inherit'],
      })
  if (result.error) {
    throw new Error(
      `${tool} could not run (${result.error.message}). Install PostgreSQL 18 client tools or set PG_TOOLS_DOCKER=1.`,
    )
  }
  if (result.status !== 0) throw new Error(`${tool} exited with ${result.status}`)
}
