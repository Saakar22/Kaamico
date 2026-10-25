import { describe, expect, it } from 'vitest'
import { clearSessionCookie, readSessionToken, serializeSessionCookie } from './cookies'
import { hashPassword, verifyPassword } from './password'
import { maskPhone, normalizeIndianMobile } from './phone'
import { homePathFor, safeNextPath } from './redirects'
import { hashOtp, safeEqualHex } from './tokens'
import { hasRole, type Actor } from './types'

describe('normalizeIndianMobile', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['(+91) 6000000000', '+916000000000'],
  ])('normalises %j', (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected)
  })

  it.each(['', '12345', '5876543210', '+1 5551234567', '98765432100', 'abcdefghij'])(
    'rejects %j',
    (input) => {
      expect(normalizeIndianMobile(input)).toBeNull()
    },
  )

  it('masks numbers for display', () => {
    expect(maskPhone('+919876543210')).toBe('+91 98••• ••210')
  })
})

describe('safeNextPath', () => {
  it('keeps same-site paths with query and hash', () => {
    expect(safeNextPath('/bookings/123?tab=offers#x', '/')).toBe('/bookings/123?tab=offers#x')
  })

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', ''])(
    'rejects %j (open redirect)',
    (next) => {
      expect(safeNextPath(next, '/dashboard')).toBe('/dashboard')
    },
  )
})

describe('homePathFor', () => {
  it('sends new users to onboarding, workers to their console and others to the dashboard', () => {
    expect(homePathFor({ roles: ['CUSTOMER'], needsOnboarding: true })).toBe('/login?step=details')
    expect(homePathFor({ roles: ['CUSTOMER', 'WORKER'], needsOnboarding: false })).toBe(
      '/worker/dashboard',
    )
    expect(homePathFor({ roles: ['CUSTOMER'], needsOnboarding: false })).toBe('/dashboard')
  })
})

describe('session cookie', () => {
  const expires = new Date(Date.now() + 3600_000)

  it('is HttpOnly, SameSite=Lax and uses __Host- over HTTPS', () => {
    const cookie = serializeSessionCookie('tok', expires, true)
    expect(cookie).toMatch(
      /^__Host-kmc_session=tok; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/,
    )
    expect(serializeSessionCookie('tok', expires, false)).toMatch(/^kmc_session=tok;/)
    expect(serializeSessionCookie('tok', expires, false)).not.toContain('Secure')
  })

  it('clears with Max-Age=0', () => {
    expect(clearSessionCookie(false)).toContain('Max-Age=0')
  })

  it('reads either cookie name from a Cookie header', () => {
    expect(readSessionToken('a=1; kmc_session=abc; b=2')).toBe('abc')
    expect(readSessionToken('__Host-kmc_session=xyz')).toBe('xyz')
    expect(readSessionToken('kmc_session_other=1')).toBeNull()
    expect(readSessionToken(null)).toBeNull()
  })
})

describe('passwords', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('correct horse battery')
    expect(hash.startsWith('scrypt$32768$8$1$')).toBe(true)
    await expect(verifyPassword('correct horse battery', hash)).resolves.toBe(true)
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false)
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false)
  })

  it('salts each hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'))
  })
})

describe('OTP hashing', () => {
  it('binds the code to the phone and the secret', () => {
    const a = hashOtp('+919876543210', '123456', 'secret')
    expect(safeEqualHex(a, hashOtp('+919876543210', '123456', 'secret'))).toBe(true)
    expect(safeEqualHex(a, hashOtp('+919876543211', '123456', 'secret'))).toBe(false)
    expect(safeEqualHex(a, hashOtp('+919876543210', '123456', 'other'))).toBe(false)
    expect(safeEqualHex(a, '')).toBe(false)
  })
})

describe('hasRole', () => {
  const actor = (roles: Actor['roles'], scope: Actor['scope']): Actor => ({
    userId: 'u',
    sessionId: 's',
    scope,
    name: 'A',
    phone: null,
    email: null,
    roles,
    needsOnboarding: false,
    workerId: null,
  })

  it('requires an admin session, not just the ADMIN role', () => {
    expect(hasRole(actor(['ADMIN'], 'ADMIN'), 'ADMIN')).toBe(true)
    expect(hasRole(actor(['ADMIN', 'CUSTOMER'], 'USER'), 'ADMIN')).toBe(false)
    expect(hasRole(actor(['CUSTOMER', 'WORKER'], 'USER'), 'WORKER')).toBe(true)
    expect(hasRole(actor(['CUSTOMER'], 'USER'), 'WORKER')).toBe(false)
  })
})
