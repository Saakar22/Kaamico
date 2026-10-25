// Admin password hashing with scrypt (node:crypto). Standalone so the seed script can use it.
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto'

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password, salt, keylen, options, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  )

// N=2^15, r=8, p=1: ~32 MiB and tens of milliseconds per hash.
const PARAMS = { N: 32768, r: 8, p: 1 }
const KEY_LENGTH = 64
const MAX_MEMORY = 64 * 1024 * 1024

/** Format: scrypt$N$r$p$<salt base64url>$<hash base64url> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEMORY })
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltText, hashText] = stored.split('$')
  if (scheme !== 'scrypt' || !saltText || !hashText) return false
  const expected = Buffer.from(hashText, 'base64url')
  const key = await scrypt(password, Buffer.from(saltText, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEMORY,
  })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

/** Burns comparable time when the account does not exist, so timing does not reveal valid emails. */
let dummyHash: Promise<string> | undefined
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('kaamico-dummy-password')
  await verifyPassword(password, await dummyHash)
  return false
}
