// Shared helpers for database scripts. Pass `--test` to target DATABASE_URL_TEST.
try {
  process.loadEnvFile('.env.local')
} catch {
  // Fall back to variables already in the environment (e.g. CI).
}

export function targetUrl(argv = process.argv) {
  const name = argv.includes('--test') ? 'DATABASE_URL_TEST' : 'DATABASE_URL'
  const url = process.env[name]
  if (!url) {
    console.error(`${name} is not set. Add it to .env.local (see .env.example).`)
    process.exit(1)
  }
  return { name, url, database: new URL(url).pathname.slice(1) }
}

export function refuseInProduction(action) {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    console.error(
      `Refusing to ${action} with NODE_ENV=production (pass --force if you really mean it).`,
    )
    process.exit(1)
  }
}
