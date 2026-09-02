import type { NextFunction, Request, Response } from 'express'
import { ZodError, type ZodType } from 'zod'

/**
 * Every failure the API answers with on purpose. Anything else that escapes a
 * handler is a bug and becomes a 500 with no internals leaked to the client.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, 'bad_request', details)
  }

  static unauthorized(message = 'Please sign in again.'): ApiError {
    return new ApiError(401, message, 'unauthorized')
  }

  static forbidden(message = 'You do not have access to this.'): ApiError {
    return new ApiError(403, message, 'forbidden')
  }

  static notFound(message = 'Not found.'): ApiError {
    return new ApiError(404, message, 'not_found')
  }

  /** Right thing to ask, wrong moment - e.g. settling an order that is already settled. */
  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, message, 'conflict', details)
  }

  static tooMany(message = 'Too many attempts. Wait a moment and try again.'): ApiError {
    return new ApiError(429, message, 'too_many_requests')
  }
}

/** Turns a zod issue list into `{ field: message }`, which is what a form needs. */
function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_'
    out[key] ??= issue.message
  }
  return out
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {})
  if (!result.success) {
    throw ApiError.badRequest('Please check the highlighted fields.', fieldErrors(result.error))
  }
  return result.data
}

export function parseQuery<T>(schema: ZodType<T>, query: unknown): T {
  const result = schema.safeParse(query ?? {})
  if (!result.success) {
    throw ApiError.badRequest('Invalid query parameters.', fieldErrors(result.error))
  }
  return result.data
}

/** Express 5 types route params as string | string[]; only the first value matters. */
type ParamValue = string | readonly string[] | undefined

export function strParam(value: ParamValue): string {
  if (Array.isArray(value)) return (value[0] ?? '').trim()
  return typeof value === 'string' ? value.trim() : ''
}

/** Route params are always strings; ids must be positive integers. */
export function intParam(value: ParamValue, what = 'id'): number {
  const parsed = Number.parseInt(strParam(value), 10)
  if (!Number.isInteger(parsed) || parsed <= 0) throw ApiError.badRequest(`Invalid ${what}.`)
  return parsed
}

/**
 * Express 5 forwards rejected promises to the error handler on its own, but
 * wrapping keeps the intent explicit and works the same if that ever changes.
 */
export function asyncHandler<R extends Request>(
  handler: (req: R, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req as R, res, next).catch(next)
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Unknown endpoint.' } })
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error)
    return
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    })
    return
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'bad_request',
        message: 'Please check the highlighted fields.',
        details: fieldErrors(error),
      },
    })
    return
  }

  // Unexpected: log the real thing for us, return something plain to the client.
  console.error('[api] unhandled error:', error)
  res.status(500).json({
    error: { code: 'server_error', message: 'Something went wrong. Please try again.' },
  })
}
