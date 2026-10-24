import { ZodError } from 'zod'
import { AppError } from './errors'
import { logger } from './logger'

export type ErrorBody = {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
    requestId: string
  }
}

const REQUEST_ID_HEADER = 'x-request-id'
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/

export function getRequestId(request: Request): string {
  const incoming = request.headers.get(REQUEST_ID_HEADER)
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID()
}

export function errorResponse(error: unknown, requestId: string): Response {
  let status: number
  let body: ErrorBody['error']

  if (error instanceof AppError) {
    status = error.status
    body = { code: error.code, message: error.message, details: error.details, requestId }
  } else if (error instanceof ZodError) {
    status = 400
    body = {
      code: 'VALIDATION_FAILED',
      message: 'The request is invalid',
      details: {
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      requestId,
    }
  } else {
    status = 500
    body = { code: 'INTERNAL', message: 'Something went wrong', requestId }
  }

  if (status >= 500) logger.error({ err: error, requestId }, 'request failed')

  return Response.json({ error: body } satisfies ErrorBody, {
    status,
    headers: { [REQUEST_ID_HEADER]: requestId },
  })
}

/**
 * Wraps a route handler: assigns a request ID, converts thrown errors into the
 * standard error envelope, and echoes the request ID on every response.
 */
export function route<Ctx = unknown>(
  handler: (request: Request, ctx: Ctx, meta: { requestId: string }) => Promise<Response>,
) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    const requestId = getRequestId(request)
    try {
      const response = await handler(request, ctx, { requestId })
      response.headers.set(REQUEST_ID_HEADER, requestId)
      return response
    } catch (error) {
      return errorResponse(error, requestId)
    }
  }
}
