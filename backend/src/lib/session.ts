import { createHmac, timingSafeEqual } from 'node:crypto'

import type { CookieOptions } from 'express'

import { env } from '../env.js'

export const SESSION_COOKIE = 'lp_session'

/** One long shift. Waiters should never be logged out mid-service. */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

export type SessionRole = 'owner' | 'waiter'

export type SessionPayload = {
  sub: number
  role: SessionRole
  name: string
  iat: number
  exp: number
}

function sign(data: string): string {
  return createHmac('sha256', env.sessionSecret).update(data).digest('base64url')
}

export function createSessionToken(
  input: { sub: number; role: SessionRole; name: string },
  now: number = Date.now(),
): string {
  const payload: SessionPayload = {
    sub: input.sub,
    role: input.role,
    name: input.name,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + SESSION_MAX_AGE_MS) / 1000),
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${body}.${sign(body)}`
}

export function readSessionToken(
  token: string | undefined | null,
  now: number = Date.now(),
): SessionPayload | null {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null

  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  const expected = sign(body)

  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (typeof payload.sub !== 'number' || (payload.role !== 'owner' && payload.role !== 'waiter')) {
      return null
    }
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null
    return payload
  } catch {
    return null
  }
}

/**
 * In dev the browser reaches the API through the Vite proxy, and in a normal
 * deployment both sit behind one domain, so SameSite=Lax is right. Set
 * COOKIE_CROSS_SITE=true only when the API really is on another domain - that
 * needs SameSite=None, which browsers only accept over HTTPS.
 */
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: env.cookieCrossSite ? 'none' : 'lax',
    secure: env.cookieCrossSite || env.isProd,
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  }
}

export function clearCookieOptions(): CookieOptions {
  const { maxAge: _maxAge, ...rest } = sessionCookieOptions()
  return rest
}
