import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as adminLogin } from '@/app/api/v1/auth/admin/login/route'
import { POST as logout } from '@/app/api/v1/auth/logout/route'
import { POST as requestOtp } from '@/app/api/v1/auth/otp/request/route'
import { POST as verifyOtp } from '@/app/api/v1/auth/otp/verify/route'
import { POST as onboarding } from '@/app/api/v1/me/onboarding/route'
import { PUT as setLanguage } from '@/app/api/v1/me/language/route'
import { GET as me } from '@/app/api/v1/me/route'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import { requireApiActor } from './actor'
import { hashPassword } from './password'

const ORIGIN = 'http://localhost:3000'

function req(
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {},
) {
  const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST')
  return new Request(ORIGIN + path, {
    method,
    headers: {
      origin: ORIGIN,
      'x-forwarded-for': '203.0.113.7',
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...opts.headers,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
}

const call = (handler: (r: Request, ctx: unknown) => Promise<Response>, r: Request) =>
  handler(r, {})
// Response bodies are asserted field by field, so a loose type keeps the tests readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as Record<string, any>
const cookieOf = (res: Response) => res.headers.get('set-cookie')!.split(';')[0]

let phoneSeq = 0
const newPhone = () => `9${String(800000000 + ++phoneSeq)}`

async function signIn(phone = newPhone()) {
  const otp = await json(
    await call(requestOtp, req('/api/v1/auth/otp/request', { body: { phone } })),
  )
  const res = await call(
    verifyOtp,
    req('/api/v1/auth/otp/verify', { body: { phone, code: otp.simulatedCode } }),
  )
  expect(res.status).toBe(200)
  return { phone, cookie: cookieOf(res), body: await json(res) }
}

async function onboard(cookie: string, body: unknown, key = randomUUID()) {
  return call(
    onboarding,
    req('/api/v1/me/onboarding', { body, cookie, headers: { 'idempotency-key': key } }),
  )
}

describe.skipIf(!hasTestDatabase)('authentication and authorisation', () => {
  const sql = connectTestDb()

  beforeEach(async () => {
    await truncateAll(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  describe('phone OTP sign-in', () => {
    it('issues a simulated code and never stores it in plain text', async () => {
      const res = await call(
        requestOtp,
        req('/api/v1/auth/otp/request', { body: { phone: '98765 43210' } }),
      )
      const body = await json(res)
      expect(res.status).toBe(200)
      expect(body).toMatchObject({ maskedPhone: '+91 98••• ••210', expiresInSeconds: 300 })
      expect(body.simulatedCode).toMatch(/^\d{6}$/)
      const [row] = await sql`select code_hash from otp_challenges where phone = '+919876543210'`
      expect(row.code_hash).toHaveLength(64)
      expect(row.code_hash).not.toContain(body.simulatedCode)
    })

    it('rejects invalid phone numbers', async () => {
      const res = await call(
        requestOtp,
        req('/api/v1/auth/otp/request', { body: { phone: '12345' } }),
      )
      expect(res.status).toBe(400)
      expect((await json(res)).error.code).toBe('VALIDATION_FAILED')
    })

    it('creates the account on first sign-in and sets a secure session cookie', async () => {
      const { cookie, body } = await signIn('9876500001')
      expect(body).toMatchObject({
        isNewUser: true,
        redirectTo: '/login?step=details',
        user: { needsOnboarding: true, roles: ['CUSTOMER'], scope: 'USER' },
      })
      expect(cookie).toMatch(/^kmc_session=[\w-]{43}$/)
      const [user] = await sql`select phone, phone_verified_at from users`
      expect(user.phone).toBe('+919876500001')
      expect(user.phone_verified_at).not.toBeNull()
    })

    it('stores only a hash of the session token', async () => {
      const { cookie } = await signIn()
      const token = cookie.split('=')[1]
      const [session] = await sql`select token_hash from auth_sessions`
      expect(session.token_hash).toHaveLength(64)
      expect(session.token_hash).not.toBe(token)
    })

    it('counts wrong codes, burns the code after 5 attempts and rejects reuse', async () => {
      const phone = newPhone()
      const otp = await json(
        await call(requestOtp, req('/api/v1/auth/otp/request', { body: { phone } })),
      )
      const wrong = otp.simulatedCode === '000000' ? '111111' : '000000'

      const first = await call(
        verifyOtp,
        req('/api/v1/auth/otp/verify', { body: { phone, code: wrong } }),
      )
      expect(first.status).toBe(400)
      expect((await json(first)).error).toMatchObject({
        code: 'OTP_INVALID',
        details: { remainingAttempts: 4 },
      })
      for (let i = 0; i < 4; i++) {
        await call(verifyOtp, req('/api/v1/auth/otp/verify', { body: { phone, code: wrong } }))
      }
      // The right code no longer works once the challenge is burned.
      const late = await call(
        verifyOtp,
        req('/api/v1/auth/otp/verify', { body: { phone, code: otp.simulatedCode } }),
      )
      expect(late.status).toBe(400)
      expect(await sql`select 1 from auth_sessions`).toHaveLength(0)
    })

    it('does not accept a code twice', async () => {
      const phone = newPhone()
      const otp = await json(
        await call(requestOtp, req('/api/v1/auth/otp/request', { body: { phone } })),
      )
      const ok = await call(
        verifyOtp,
        req('/api/v1/auth/otp/verify', { body: { phone, code: otp.simulatedCode } }),
      )
      expect(ok.status).toBe(200)
      const replay = await call(
        verifyOtp,
        req('/api/v1/auth/otp/verify', { body: { phone, code: otp.simulatedCode } }),
      )
      expect(replay.status).toBe(400)
    })

    it('rejects expired codes', async () => {
      const phone = newPhone()
      const otp = await json(
        await call(requestOtp, req('/api/v1/auth/otp/request', { body: { phone } })),
      )
      await sql`update otp_challenges set expires_at = now() - interval '1 second'`
      const res = await call(
        verifyOtp,
        req('/api/v1/auth/otp/verify', { body: { phone, code: otp.simulatedCode } }),
      )
      expect(res.status).toBe(400)
    })

    it('rate-limits code requests per phone number', async () => {
      const phone = newPhone()
      for (let i = 0; i < 3; i++) {
        expect(
          (await call(requestOtp, req('/api/v1/auth/otp/request', { body: { phone } }))).status,
        ).toBe(200)
      }
      const blocked = await call(requestOtp, req('/api/v1/auth/otp/request', { body: { phone } }))
      expect(blocked.status).toBe(429)
      expect((await json(blocked)).error.details.retryAfterSeconds).toBeGreaterThan(0)
    })

    it('refuses suspended accounts', async () => {
      const { phone } = await signIn()
      await sql`update users set status = 'SUSPENDED'`
      const otp = await json(
        await call(requestOtp, req('/api/v1/auth/otp/request', { body: { phone } })),
      )
      const res = await call(
        verifyOtp,
        req('/api/v1/auth/otp/verify', { body: { phone, code: otp.simulatedCode } }),
      )
      expect(res.status).toBe(403)
      expect((await json(res)).error.code).toBe('ACCOUNT_SUSPENDED')
    })

    it('ignores off-site `next` redirects', async () => {
      const { cookie } = await signIn()
      await onboard(cookie, { name: 'Asha', role: 'CUSTOMER' })
      const phone = (await sql`select phone from users`)[0].phone as string
      const otp = await json(
        await call(requestOtp, req('/api/v1/auth/otp/request', { body: { phone } })),
      )
      const res = await call(
        verifyOtp,
        req('/api/v1/auth/otp/verify', {
          body: { phone, code: otp.simulatedCode, next: 'https://evil.example/x' },
        }),
      )
      expect((await json(res)).redirectTo).toBe('/dashboard')
    })
  })

  describe('sessions', () => {
    it('resolves /me with the cookie and returns 401 without it', async () => {
      const { cookie } = await signIn()
      const ok = await call(me, req('/api/v1/me', { cookie }))
      expect(ok.status).toBe(200)
      expect((await json(ok)).user.needsOnboarding).toBe(true)
      expect((await call(me, req('/api/v1/me'))).status).toBe(401)
      expect((await call(me, req('/api/v1/me', { cookie: 'kmc_session=forged' }))).status).toBe(401)
    })

    it('ends the session on logout', async () => {
      const { cookie } = await signIn()
      const out = await call(logout, req('/api/v1/auth/logout', { body: {}, cookie }))
      expect(out.headers.get('set-cookie')).toContain('Max-Age=0')
      expect((await call(me, req('/api/v1/me', { cookie }))).status).toBe(401)
    })

    it('rejects expired sessions and sessions of suspended users', async () => {
      const a = await signIn()
      await sql`update auth_sessions set expires_at = now() - interval '1 second'`
      expect((await call(me, req('/api/v1/me', { cookie: a.cookie }))).status).toBe(401)

      const b = await signIn()
      await sql`update users set status = 'SUSPENDED' where phone = ${'+91' + b.phone}`
      expect((await call(me, req('/api/v1/me', { cookie: b.cookie }))).status).toBe(401)
    })
  })

  describe('CSRF', () => {
    it('rejects mutations without a same-site Origin', async () => {
      const noOrigin = new Request(`${ORIGIN}/api/v1/auth/otp/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: newPhone() }),
      })
      expect((await call(requestOtp, noOrigin)).status).toBe(403)
      const crossSite = req('/api/v1/auth/otp/request', {
        body: { phone: newPhone() },
        headers: { origin: 'https://evil.example' },
      })
      expect((await call(requestOtp, crossSite)).status).toBe(403)
    })
  })

  describe('onboarding', () => {
    it('requires an Idempotency-Key and refuses the ADMIN role', async () => {
      const { cookie } = await signIn()
      const noKey = await call(
        onboarding,
        req('/api/v1/me/onboarding', { body: { name: 'Asha', role: 'CUSTOMER' }, cookie }),
      )
      expect(noKey.status).toBe(400)
      const admin = await onboard(cookie, { name: 'Asha', role: 'ADMIN' })
      expect(admin.status).toBe(400)
      const [user] = await sql`select roles from users`
      expect(user.roles).toEqual(['CUSTOMER'])
    })

    it('blocks other APIs until onboarding is finished', async () => {
      const { cookie } = await signIn()
      await expect(requireApiActor(req('/api/v1/anything', { cookie }))).rejects.toMatchObject({
        status: 403,
      })
    })

    it('sets up a customer and replays the response for a retried key', async () => {
      const { cookie } = await signIn()
      const key = randomUUID()
      const first = await onboard(cookie, { name: '  Asha Patil ', role: 'CUSTOMER' }, key)
      expect(await json(first)).toMatchObject({ roles: ['CUSTOMER'], redirectTo: '/dashboard' })

      const retry = await onboard(cookie, { name: '  Asha Patil ', role: 'CUSTOMER' }, key)
      expect(retry.headers.get('idempotent-replayed')).toBe('true')
      const mismatch = await onboard(cookie, { name: 'Someone else', role: 'CUSTOMER' }, key)
      expect(mismatch.status).toBe(409)

      const [user] = await sql`select name from users`
      expect(user.name).toBe('Asha Patil')
      expect(await sql`select 1 from customer_profiles`).toHaveLength(1)
    })

    it('sends a new customer where they were heading, and a new professional to setup', async () => {
      const customer = await signIn()
      const res = await onboard(customer.cookie, {
        name: 'Asha',
        role: 'CUSTOMER',
        next: '/profile',
      })
      expect((await json(res)).redirectTo).toBe('/profile')

      const outside = await signIn()
      const away = await onboard(outside.cookie, {
        name: 'Asha',
        role: 'CUSTOMER',
        next: '//evil.example',
      })
      expect((await json(away)).redirectTo).toBe('/dashboard')

      const worker = await signIn()
      const setup = await onboard(worker.cookie, { name: 'Ravi', role: 'WORKER', next: '/profile' })
      expect((await json(setup)).redirectTo).toBe('/worker/dashboard')
    })

    it('lets a customer add the WORKER role and creates an unverified worker profile', async () => {
      const { cookie } = await signIn()
      await onboard(cookie, { name: 'Ravi Kumar', role: 'CUSTOMER' })
      const res = await onboard(cookie, { name: 'Ravi Kumar', role: 'WORKER' })
      expect(await json(res)).toMatchObject({
        roles: ['CUSTOMER', 'WORKER'],
        redirectTo: '/worker/dashboard',
      })
      const [worker] = await sql`select display_name, verification_status from worker_profiles`
      expect(worker).toMatchObject({
        display_name: 'Ravi Kumar',
        verification_status: 'UNVERIFIED',
      })

      const meRes = await json(await call(me, req('/api/v1/me', { cookie })))
      expect(meRes.user.workerId).toEqual(expect.any(String))
    })
  })

  describe('admin sign-in', () => {
    async function createAdmin(password = 'admin-pass-123') {
      await sql`insert into users (email, name, roles, password_hash)
        values ('admin@kaamico.test', 'Admin', '{ADMIN}', ${await hashPassword(password)})`
    }
    const login = (body: unknown) => call(adminLogin, req('/api/v1/auth/admin/login', { body }))

    it('creates an 8-hour ADMIN session for valid credentials', async () => {
      await createAdmin()
      const res = await login({ email: 'Admin@Kaamico.test', password: 'admin-pass-123' })
      expect(res.status).toBe(200)
      expect(await json(res)).toEqual({ redirectTo: '/admin' })
      const actor = await requireApiActor(req('/api/v1/admin/x', { cookie: cookieOf(res) }), {
        role: 'ADMIN',
      })
      expect(actor.scope).toBe('ADMIN')
      const [s] =
        await sql`select extract(epoch from expires_at - created_at) / 3600 as hours from auth_sessions`
      expect(Math.round(Number(s.hours))).toBe(8)
    })

    it('gives the same answer for a wrong password, an unknown email and a non-admin', async () => {
      await createAdmin()
      await sql`insert into users (email, name, roles) values ('customer@kaamico.test', 'C', '{CUSTOMER}')`
      for (const body of [
        { email: 'admin@kaamico.test', password: 'nope' },
        { email: 'nobody@kaamico.test', password: 'admin-pass-123' },
        { email: 'customer@kaamico.test', password: 'admin-pass-123' },
      ]) {
        const res = await login(body)
        expect(res.status).toBe(401)
        expect((await json(res)).error).toMatchObject({
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect.',
        })
      }
    })

    it('locks an email after 10 failed attempts', async () => {
      await createAdmin()
      for (let i = 0; i < 10; i++) await login({ email: 'admin@kaamico.test', password: 'wrong' })
      const locked = await login({ email: 'admin@kaamico.test', password: 'admin-pass-123' })
      expect(locked.status).toBe(429)
    })

    it('never grants admin powers to a phone session, even for a user with the ADMIN role', async () => {
      const { cookie, phone } = await signIn()
      await sql`update users set roles = '{CUSTOMER,ADMIN}', name = 'Dual' where phone = ${'+91' + phone}`
      await expect(
        requireApiActor(req('/api/v1/admin/x', { cookie }), { role: 'ADMIN' }),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('invalidates admin sessions when the ADMIN role is removed', async () => {
      await createAdmin()
      const res = await login({ email: 'admin@kaamico.test', password: 'admin-pass-123' })
      await sql`update users set roles = '{CUSTOMER}', password_hash = null`
      expect((await call(me, req('/api/v1/me', { cookie: cookieOf(res) }))).status).toBe(401)
    })
  })

  describe('language', () => {
    const verifyWith = async (phone: string, langCookie?: string) => {
      const otp = await json(
        await call(requestOtp, req('/api/v1/auth/otp/request', { body: { phone } })),
      )
      return call(
        verifyOtp,
        req('/api/v1/auth/otp/verify', {
          body: { phone, code: otp.simulatedCode },
          ...(langCookie ? { cookie: `kmc_lang=${langCookie}` } : {}),
        }),
      )
    }
    const savedLocale = async (phone: string) =>
      (await sql`select preferred_locale from users where phone = ${`+91${phone}`}`)[0]
        .preferred_locale

    it('keeps the language a new account signed up in, and brings it back on a new device', async () => {
      const phone = newPhone()
      expect((await verifyWith(phone, 'hi')).status).toBe(200)
      expect(await savedLocale(phone)).toBe('hi')
      // Another browser with no choice yet gets the saved language.
      const again = await verifyWith(phone)
      expect(again.headers.get('set-cookie')).toContain('kmc_lang=hi')
    })

    it('saves a switch made while signed in', async () => {
      const { phone, cookie } = await signIn()
      const res = await call(
        setLanguage,
        req('/api/v1/me/language', { method: 'PUT', body: { locale: 'hi' }, cookie }),
      )
      expect(res.status).toBe(200)
      expect(await savedLocale(phone)).toBe('hi')
      const bad = await call(
        setLanguage,
        req('/api/v1/me/language', { method: 'PUT', body: { locale: 'fr' }, cookie }),
      )
      expect(bad.status).toBe(400)
      expect(
        (
          await call(
            setLanguage,
            req('/api/v1/me/language', { method: 'PUT', body: { locale: 'hi' } }),
          )
        ).status,
      ).toBe(401)
    })
  })
})
