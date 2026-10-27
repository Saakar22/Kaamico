import { createHash, createHmac } from 'node:crypto'

/**
 * AWS Signature Version 4 for single requests (S3, Cloudflare R2, MinIO). Small and
 * dependency-free; checked against AWS's published example in `sigv4.test.ts`.
 */

export type SigningInput = {
  method: string
  url: URL
  headers: Record<string, string>
  /** Hex SHA-256 of the body ("UNSIGNED-PAYLOAD" is also accepted by S3). */
  payloadHash: string
  region: string
  service: string
  accessKeyId: string
  secretAccessKey: string
  now: Date
}

export const sha256Hex = (data: Uint8Array | string) =>
  createHash('sha256').update(data).digest('hex')

const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest()

/** RFC 3986 encoding, as SigV4 requires (S3 keeps "/" in paths). */
function encode(value: string, keepSlash = false): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(keepSlash ? /%2F/g : /$^/, '/')
}

export function amzDate(now: Date): { stamp: string; day: string } {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return { stamp, day: stamp.slice(0, 8) }
}

/** Returns the headers to send: the input headers plus `x-amz-date` and `authorization`. */
export function signRequest(input: SigningInput): Record<string, string> {
  const { stamp, day } = amzDate(input.now)
  const headers: Record<string, string> = { ...input.headers, 'x-amz-date': stamp }
  if (!Object.keys(headers).some((h) => h.toLowerCase() === 'host')) headers.host = input.url.host

  const canonicalHeaders = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const signedHeaders = canonicalHeaders.map(([k]) => k).join(';')
  const query = [...input.url.searchParams]
    .map(([k, v]) => [encode(k), encode(v)] as const)
    .sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const path =
    input.service === 's3'
      ? encode(decodeURIComponent(input.url.pathname), true)
      : input.url.pathname || '/'

  const canonicalRequest = [
    input.method,
    path,
    query,
    canonicalHeaders.map(([k, v]) => `${k}:${v}\n`).join(''),
    signedHeaders,
    input.payloadHash,
  ].join('\n')
  const scope = `${day}/${input.region}/${input.service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256Hex(canonicalRequest)].join('\n')
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), input.service),
    'aws4_request',
  )
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}
