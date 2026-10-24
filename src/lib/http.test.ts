import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { businessRule, notFound } from './errors'
import { route, type ErrorBody } from './http'

const call = (handler: Parameters<typeof route>[0], headers: HeadersInit = {}) =>
  route(handler)(new Request('http://localhost/api/test', { headers }), {})

describe('route', () => {
  it('echoes a valid incoming request id', async () => {
    const res = await call(async () => Response.json({ ok: true }), {
      'x-request-id': 'abc12345-test',
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-request-id')).toBe('abc12345-test')
  })

  it('replaces a malformed request id', async () => {
    const res = await call(async () => Response.json({}), { 'x-request-id': 'bad id!' })
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('maps AppError to its status and code', async () => {
    const res = await call(async () => {
      throw notFound('Booking not found')
    })
    const body = (await res.json()) as ErrorBody
    expect(res.status).toBe(404)
    expect(body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Booking not found' })
    expect(body.error.requestId).toBe(res.headers.get('x-request-id'))
  })

  it('maps business rules to 422 with details', async () => {
    const res = await call(async () => {
      throw businessRule('OFFER_BELOW_FLOOR', 'Offer is too low', { minPaise: 20_000 })
    })
    const body = (await res.json()) as ErrorBody
    expect(res.status).toBe(422)
    expect(body.error).toMatchObject({ code: 'OFFER_BELOW_FLOOR', details: { minPaise: 20_000 } })
  })

  it('maps ZodError to 400 VALIDATION_FAILED with issue paths', async () => {
    const res = await call(async () => {
      z.object({ amountPaise: z.number().int() }).parse({ amountPaise: 'x' })
      return Response.json({})
    })
    const body = (await res.json()) as ErrorBody
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_FAILED')
    expect(body.error.details).toMatchObject({ issues: [{ path: 'amountPaise' }] })
  })

  it('hides unexpected errors behind a generic 500', async () => {
    const res = await call(async () => {
      throw new Error('connection string with secrets')
    })
    const body = (await res.json()) as ErrorBody
    expect(res.status).toBe(500)
    expect(body.error).toMatchObject({ code: 'INTERNAL', message: 'Something went wrong' })
    expect(JSON.stringify(body)).not.toContain('secrets')
  })
})
