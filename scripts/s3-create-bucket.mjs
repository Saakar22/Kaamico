// Creates the private bucket named by S3_BUCKET on an S3-compatible server (local or
// staging SeaweedFS/MinIO). On AWS S3 or Cloudflare R2, create it in their console instead.
//   node scripts/s3-create-bucket.mjs
import { sha256Hex, signRequest } from '../src/lib/storage/sigv4.ts'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Containers and CI provide variables directly.
}

const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env
if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
  console.error('Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.')
  process.exit(1)
}
const url = new URL(`${S3_ENDPOINT.replace(/\/$/, '')}/${S3_BUCKET}`)
const headers = signRequest({
  method: 'PUT',
  url,
  headers: { 'x-amz-content-sha256': sha256Hex('') },
  payloadHash: sha256Hex(''),
  region:
    process.env.S3_REGION && process.env.S3_REGION !== 'auto' ? process.env.S3_REGION : 'us-east-1',
  service: 's3',
  accessKeyId: S3_ACCESS_KEY_ID,
  secretAccessKey: S3_SECRET_ACCESS_KEY,
  now: new Date(),
})
delete headers.host
const res = await fetch(url, { method: 'PUT', headers })
if (res.ok || res.status === 409) {
  console.log(`bucket ${S3_BUCKET} ready (${res.status === 409 ? 'already existed' : 'created'})`)
} else {
  console.error(`could not create bucket ${S3_BUCKET}: ${res.status} ${await res.text()}`)
  process.exit(1)
}
