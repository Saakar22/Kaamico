import { randomUUID } from 'node:crypto'
import type postgres from 'postgres'
import { SESSION_COOKIE_PLAIN } from '@/modules/auth/cookies'
import { createSession } from '@/modules/auth/sessions'

/** Helpers for calling route handlers directly in integration tests. */

export const ORIGIN = 'http://localhost:3000'

type Handler<Ctx> = (request: Request, ctx: Ctx) => Promise<Response>

export function req(
  path: string,
  opts: {
    method?: string
    body?: unknown
    form?: FormData
    cookie?: string
    headers?: Record<string, string>
  } = {},
): Request {
  const hasBody = opts.body !== undefined || opts.form !== undefined
  return new Request(ORIGIN + path, {
    method: opts.method ?? (hasBody ? 'POST' : 'GET'),
    headers: {
      origin: ORIGIN,
      'x-forwarded-for': '203.0.113.9',
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...opts.headers,
    },
    body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  })
}

export const call = <Ctx>(handler: Handler<Ctx>, request: Request, ctx?: Ctx) =>
  handler(request, ctx ?? ({ params: Promise.resolve({}) } as Ctx))

export const withId = (id: string) => ({ params: Promise.resolve({ id }) })

// Response bodies are asserted field by field, so a loose type keeps tests readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const json = async (res: Response) => (await res.json()) as Record<string, any>

let phoneSeq = 0
const nextPhone = () => `+9196${String(++phoneSeq).padStart(8, '0')}`

/** A signed-in user (session cookie) created straight in the database. */
export async function userWithSession(
  sql: postgres.Sql,
  opts: { role: 'CUSTOMER' | 'WORKER' | 'ADMIN'; name?: string },
): Promise<{ userId: string; workerId: string | null; cookie: string }> {
  const name = opts.name ?? `Test ${opts.role.toLowerCase()}`
  const [u] =
    opts.role === 'ADMIN'
      ? await sql`insert into users (email, name, roles) values (${`admin-${randomUUID()}@kaamico.test`}, ${name}, '{ADMIN}') returning id`
      : await sql`insert into users (phone, name, roles) values (${nextPhone()}, ${name}, ${`{${opts.role}}`}) returning id`
  let workerId: string | null = null
  if (opts.role === 'WORKER') {
    const [w] = await sql`insert into worker_profiles (user_id, display_name)
      values (${u.id}, ${name}) returning id`
    workerId = w.id
  }
  const { token } = await createSession({
    userId: u.id,
    scope: opts.role === 'ADMIN' ? 'ADMIN' : 'USER',
    ip: null,
    userAgent: null,
  })
  return { userId: u.id, workerId, cookie: `${SESSION_COOKIE_PLAIN}=${token}` }
}

/** Multipart body for POST /api/v1/uploads. */
export function uploadForm(
  bytes: Uint8Array,
  purpose: string,
  name = 'photo.jpg',
  type = 'image/jpeg',
) {
  const form = new FormData()
  form.set('file', new File([bytes as Uint8Array<ArrayBuffer>], name, { type }))
  form.set('purpose', purpose)
  return form
}
