import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { S3Storage, type S3Config } from './s3'
import { sha256Hex, signRequest } from './sigv4'

/**
 * Runs against a real S3-compatible server when S3_TEST_ENDPOINT is set, e.g. SeaweedFS:
 *   docker run -p 8333:8333 chrislusf/seaweedfs:3.80 server -s3 -s3.config=…
 * (see docs/runbook.md). Skipped otherwise.
 */
const endpoint = process.env.S3_TEST_ENDPOINT

describe.skipIf(!endpoint)('S3Storage against a real S3 API', () => {
  const config: S3Config = {
    endpoint: endpoint!,
    bucket: `kaamico-test-${randomUUID().slice(0, 8)}`,
    region: process.env.S3_TEST_REGION ?? 'us-east-1',
    accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? '',
    pathStyle: true,
  }
  const storage = new S3Storage(config)

  beforeAll(async () => {
    const url = new URL(`${endpoint!.replace(/\/$/, '')}/${config.bucket}`)
    const headers = signRequest({
      method: 'PUT',
      url,
      headers: { 'x-amz-content-sha256': sha256Hex('') },
      payloadHash: sha256Hex(''),
      region: config.region,
      service: 's3',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      now: new Date(),
    })
    delete headers.host
    const res = await fetch(url, { method: 'PUT', headers })
    expect(res.status).toBe(200)
  })

  it('writes, reads and deletes private files with signed requests', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 1, 2, 3])
    await storage.put('kyc/user-1/doc-a', bytes)
    expect(await storage.get('kyc/user-1/doc-a')).toEqual(bytes)
    await storage.delete('kyc/user-1/doc-a')
    expect(await storage.get('kyc/user-1/doc-a')).toBeNull()
    await storage.delete('kyc/user-1/doc-a') // deleting twice is fine
  })

  it('is refused with the wrong secret and by anonymous readers', async () => {
    await storage.put('uploads/u/photo', new Uint8Array([1]))
    const wrong = new S3Storage({ ...config, secretAccessKey: 'not-the-secret' })
    await expect(wrong.get('uploads/u/photo')).rejects.toThrow(/Storage read failed \(403\)/)
    const anonymous = await fetch(`${endpoint!.replace(/\/$/, '')}/${config.bucket}/uploads/u/photo`)
    expect(anonymous.status).toBe(403)
  })

  it('rejects keys that could escape the bucket prefix', async () => {
    await expect(storage.get('../other-bucket/x')).rejects.toThrow(/Invalid storage key/)
  })
})
