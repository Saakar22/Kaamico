// Runs the expiry sweeper once (normally a scheduler calls it every minute).
//   npm run sweep
try {
  process.loadEnvFile('.env.local')
} catch {
  // CI and servers provide variables directly.
}

const base = process.env.APP_URL ?? 'http://localhost:3000'
const secret = process.env.CRON_SECRET
if (!secret) {
  console.error('CRON_SECRET is not set (add it to .env.local).')
  process.exit(1)
}
const res = await fetch(`${base}/api/internal/sweep`, {
  method: 'POST',
  headers: { authorization: `Bearer ${secret}` },
})
const body = await res.json().catch(() => ({}))
if (!res.ok) {
  console.error(`sweep failed (${res.status}):`, body.error?.message ?? body)
  process.exit(1)
}
console.log(`expired ${body.expired.offers} offers and ${body.expired.bookings} requests`)
