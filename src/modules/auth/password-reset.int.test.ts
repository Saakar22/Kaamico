import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as forgotRoute } from '@/app/api/v1/auth/admin/forgot-password/route'
import { POST as loginRoute } from '@/app/api/v1/auth/admin/login/route'
import { POST as resetRoute } from '@/app/api/v1/auth/admin/reset-password/route'
import { devMailbox } from '@/modules/notifications/email'
import { call, json, req } from '@/test/api'
import { connectTestDb, hasTestDatabase, truncateAll } from '@/test/db'
import { hashPassword } from './password'
import { createSession } from './sessions'

describe.skipIf(!hasTestDatabase)('admin password reset', () => {
  const sql = connectTestDb()

  beforeEach(async () => {
    await truncateAll(sql)
  })
  afterAll(async () => {
    await sql.end()
  })

  async function createAdmin(email = 'admin@kaamico.test') {
    const [u] = await sql`insert into users (email, name, roles, password_hash)
      values (${email}, 'Admin', '{ADMIN}', ${await hashPassword('old-password-123')}) returning id`
    return u.id as string
  }
  const forgot = (email: string) =>
    call(forgotRoute, req('/api/v1/auth/admin/forgot-password', { body: { email } }))
  const reset = (token: string, password: string) =>
    call(resetRoute, req('/api/v1/auth/admin/reset-password', { body: { token, password } }))
  const login = (password: string) =>
    call(loginRoute, req('/', { body: { email: 'admin@kaamico.test', password } }))
  /** The token from the newest console-mode email to this address. */
  const lastToken = (to: string) => {
    const mail = devMailbox().find((m) => m.to === to)
    return mail?.text.match(/token=([\w-]+)/)?.[1]
  }

  it('emails a one-time link that sets a new password and signs the admin out', async () => {
    const id = await createAdmin()
    await createSession({ userId: id, scope: 'ADMIN', ip: null, userAgent: null })

    const res = await forgot('Admin@Kaamico.test')
    expect(res.status).toBe(200)
    const token = lastToken('admin@kaamico.test')!
    expect(token).toBeTruthy()
    expect(await sql`select 1 from password_resets where token_hash = ${token}`).toHaveLength(0) // only the hash is stored

    const short = await reset(token, 'short')
    expect(short.status).toBe(400)

    expect((await reset(token, 'new-password-456')).status).toBe(200)
    expect(await sql`select 1 from auth_sessions where user_id = ${id}`).toHaveLength(0)
    expect((await login('old-password-123')).status).toBe(401)
    expect((await login('new-password-456')).status).toBe(200)
    const [audit] = await sql`select action from admin_audit_logs where entity_id = ${id}`
    expect(audit.action).toBe('admin.password_reset')

    const again = await reset(token, 'another-password-789')
    expect(again.status).toBe(422)
    expect((await json(again)).error.code).toBe('RESET_LINK_INVALID')
  })

  it('answers the same for unknown addresses and non-admins, and sends them nothing', async () => {
    await sql`insert into users (email, name, roles) values ('cust@kaamico.test', 'C', '{CUSTOMER}')`
    for (const email of ['nobody@kaamico.test', 'cust@kaamico.test']) {
      const res = await forgot(email)
      expect(res.status).toBe(200)
      expect(await json(res)).toEqual({ sent: true })
      expect(lastToken(email)).toBeUndefined()
    }
    expect(await sql`select 1 from password_resets`).toHaveLength(0)
  })

  it('keeps only the newest link working and refuses expired ones', async () => {
    const id = await createAdmin()
    await forgot('admin@kaamico.test')
    const first = lastToken('admin@kaamico.test')!
    await forgot('admin@kaamico.test')
    const second = lastToken('admin@kaamico.test')!
    expect(second).not.toBe(first)
    expect((await reset(first, 'new-password-456')).status).toBe(422)

    await sql`update password_resets set expires_at = now() - interval '1 minute' where user_id = ${id}`
    expect((await reset(second, 'new-password-456')).status).toBe(422)
  })

  it('limits reset requests per address', async () => {
    await createAdmin()
    for (let i = 0; i < 3; i++) expect((await forgot('admin@kaamico.test')).status).toBe(200)
    expect((await forgot('admin@kaamico.test')).status).toBe(429)
  })
})
