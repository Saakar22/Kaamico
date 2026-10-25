import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LocalStorage } from './index'
import { createFileToken, verifyFileToken } from './signed-url'

describe('LocalStorage', () => {
  let dir: string
  let storage: LocalStorage
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'kaamico-storage-'))
    storage = new LocalStorage(dir)
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('stores, reads and deletes files', async () => {
    await storage.put('kyc/user-1/abc', new Uint8Array([1, 2, 3]))
    expect(await storage.get('kyc/user-1/abc')).toEqual(new Uint8Array([1, 2, 3]))
    await storage.delete('kyc/user-1/abc')
    expect(await storage.get('kyc/user-1/abc')).toBeNull()
  })

  it('never overwrites an existing key', async () => {
    await storage.put('uploads/u/once', new Uint8Array([1]))
    await expect(storage.put('uploads/u/once', new Uint8Array([2]))).rejects.toThrow()
  })

  it('rejects keys that could escape the storage folder', async () => {
    for (const key of ['../secret', 'kyc/../../etc/passwd', '/abs/path', 'kyc\\x\\y', 'kyc/a.b']) {
      await expect(storage.get(key)).rejects.toThrow(/Invalid storage key/)
    }
  })
})

describe('signed file URLs', () => {
  const file = { key: 'kyc/user-1/doc', mimeType: 'image/jpeg' }
  const now = new Date('2026-10-26T10:00:00Z')

  it('grants access to exactly the signed file until it expires', () => {
    const { token, expiresAt } = createFileToken(file, now)
    expect(expiresAt.toISOString()).toBe('2026-10-26T10:05:00.000Z')
    expect(verifyFileToken(token, now)).toMatchObject({ key: file.key, mimeType: 'image/jpeg' })
    expect(verifyFileToken(token, new Date('2026-10-26T10:04:59Z'))).not.toBeNull()
    expect(verifyFileToken(token, new Date('2026-10-26T10:05:00Z'))).toBeNull()
  })

  it('rejects tampered, forged and malformed tokens', () => {
    const { token } = createFileToken(file, now)
    const [data, signature] = token.split('.')
    const other = Buffer.from(JSON.stringify({ k: 'kyc/user-2/doc', t: 'image/jpeg', e: 9e9 }))
    expect(verifyFileToken(`${other.toString('base64url')}.${signature}`, now)).toBeNull()
    expect(verifyFileToken(`${data}.${signature.slice(0, -2)}xx`, now)).toBeNull()
    expect(verifyFileToken(data, now)).toBeNull()
    expect(verifyFileToken(`${token}.extra`, now)).toBeNull()
    expect(verifyFileToken('', now)).toBeNull()
  })
})
