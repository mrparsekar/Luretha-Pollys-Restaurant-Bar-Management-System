import { eq } from 'drizzle-orm'
import type { NextFunction, Request, Response } from 'express'

import { db } from '../db/index.js'
import { staff } from '../db/schema.js'
import { ApiError } from '../lib/http.js'
import { SESSION_COOKIE, readSessionToken, type SessionPayload, type SessionRole } from '../lib/session.js'

declare global {
  namespace Express {
    interface Request {
      session?: SessionPayload
    }
  }
}

/**
 * A cookie stays valid for a shift, so a waiter the owner just deactivated would
 * otherwise keep working until it expires. We re-check the row, but cache the
 * answer briefly - staleness is bounded at 15s instead of a query per request.
 */
const STAFF_TTL_MS = 15_000
const cache = new Map<number, { active: boolean; role: SessionRole; name: string; at: number }>()

export function forgetStaff(id: number): void {
  cache.delete(id)
}

async function loadStaff(id: number) {
  const cached = cache.get(id)
  const now = Date.now()
  if (cached && now - cached.at < STAFF_TTL_MS) return cached

  const row = await db
    .select({ role: staff.role, name: staff.name, isActive: staff.isActive })
    .from(staff)
    .where(eq(staff.id, id))
    .limit(1)

  const found = row[0]
  const entry = {
    active: Boolean(found?.isActive),
    role: (found?.role ?? 'waiter') as SessionRole,
    name: found?.name ?? '',
    at: now,
  }
  cache.set(id, entry)
  return entry
}

/** Reads the cookie for every request; never rejects. Guards do the rejecting. */
export function attachSession(req: Request, _res: Response, next: NextFunction): void {
  const raw = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE]
  const payload = readSessionToken(typeof raw === 'string' ? raw : null)
  if (payload) req.session = payload
  next()
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const session = req.session
  if (!session) {
    next(ApiError.unauthorized())
    return
  }
  loadStaff(session.sub)
    .then((row) => {
      if (!row.active) {
        next(ApiError.unauthorized('This account is no longer active.'))
        return
      }
      // The row wins over the cookie: a role change takes effect without re-login.
      req.session = { ...session, role: row.role, name: row.name }
      next()
    })
    .catch(next)
}

export function requireRole(...roles: readonly SessionRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const session = req.session
    if (!session) {
      next(ApiError.unauthorized())
      return
    }
    if (!roles.includes(session.role)) {
      next(ApiError.forbidden())
      return
    }
    next()
  }
}

export const requireOwner = requireRole('owner')

/** For handlers that ran behind requireAuth and know a session exists. */
export function actor(req: Request): SessionPayload {
  const session = req.session
  if (!session) throw ApiError.unauthorized()
  return session
}

export function isOwner(req: Request): boolean {
  return req.session?.role === 'owner'
}
