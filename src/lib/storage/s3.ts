import { assertStorageKey, type StorageDriver } from './index'
import { sha256Hex, signRequest } from './sigv4'

/**
 * Private object storage over the S3 API: AWS S3 (ap-south-1), Cloudflare R2 or MinIO.
 * The bucket must be private; files leave only through the app's permission-checked
 * routes, never by public or presigned bucket URLs. Providers encrypt objects at rest.
 */

export type S3Config = {
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  /** `https://endpoint/bucket/key` (R2, MinIO) rather than `https://bucket.endpoint/key`. */
  pathStyle: boolean
}

const TIMEOUT_MS = 15_000

export class S3Storage implements StorageDriver {
  constructor(private readonly config: S3Config) {}

  private url(key: string): URL {
    assertStorageKey(key)
    const base = new URL(this.config.endpoint)
    if (this.config.pathStyle) {
      base.pathname = `${base.pathname.replace(/\/$/, '')}/${this.config.bucket}/${key}`
    } else {
      base.hostname = `${this.config.bucket}.${base.hostname}`
      base.pathname = `/${key}`
    }
    return base
  }

  private async send(
    method: 'PUT' | 'GET' | 'DELETE',
    key: string,
    body?: Uint8Array,
    extra: Record<string, string> = {},
  ): Promise<Response> {
    const url = this.url(key)
    const headers = signRequest({
      method,
      url,
      headers: {
        ...extra,
        'x-amz-content-sha256': sha256Hex(body ?? ''),
        ...(body ? { 'content-length': String(body.byteLength) } : {}),
      },
      payloadHash: sha256Hex(body ?? ''),
      region: this.config.region,
      service: 's3',
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      now: new Date(),
    })
    delete headers.host // fetch sets it, and refuses it as a header
    return fetch(url, {
      method,
      headers,
      body: body ? Buffer.from(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    // `If-None-Match: *` refuses to overwrite, like the local driver: every key is new.
    const res = await this.send('PUT', key, bytes, {
      'content-type': 'application/octet-stream',
      'if-none-match': '*',
    })
    if (!res.ok) throw new Error(`Storage write failed (${res.status}) for ${key}`)
  }

  async get(key: string): Promise<Uint8Array | null> {
    const res = await this.send('GET', key)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Storage read failed (${res.status}) for ${key}`)
    return new Uint8Array(await res.arrayBuffer())
  }

  async delete(key: string): Promise<void> {
    const res = await this.send('DELETE', key)
    if (!res.ok && res.status !== 404) {
      throw new Error(`Storage delete failed (${res.status}) for ${key}`)
    }
  }
}
