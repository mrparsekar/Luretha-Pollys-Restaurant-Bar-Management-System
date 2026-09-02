import { Router } from 'express'
import { z } from 'zod'

import { env } from '../env'
import { ApiError, asyncHandler, parseBody } from '../lib/http'
import { hit, reset } from '../lib/rate-limit'
import {
  SESSION_COOKIE,
  clearCookieOptions,
  createSessionToken,
  sessionCookieOptions,
} from '../lib/session'
import { actor, requireAuth } from '../middleware/auth'
import { listLoginStaff, loginOwner, loginWithPin } from '../services/auth'

export const authRouter = Router()

const LOGIN_WINDOW_MS = 5 * 60 * 1000

function guardRate(ip: string, kind: string): void {
  const result = hit(`login:${kind}:${ip}`, env.loginRateLimit, LOGIN_WINDOW_MS)
  if (!result.allowed) {
    throw ApiError.tooMany(`Too many attempts. Try again in ${result.retryAfterSeconds} seconds.`)
  }
}

/** Names for the PIN screen. Public by necessity: it is the login screen itself. */
authRouter.get(
  '/staff',
  asyncHandler(async (_req, res) => {
    res.json({ staff: await listLoginStaff() })
  }),
)

const pinSchema = z.object({
  staffId: z.coerce.number().int().positive(),
  pin: z.string().regex(/^\d{4,6}$/, 'Enter your 4 to 6 digit PIN.'),
})

authRouter.post(
  '/pin',
  asyncHandler(async (req, res) => {
    const ip = req.ip ?? 'unknown'
    guardRate(ip, 'pin')
    const body = parseBody(pinSchema, req.body)

    const session = await loginWithPin(body.staffId, body.pin)
    reset(`login:pin:${ip}`)

    res.cookie(SESSION_COOKIE, createSessionToken(session), sessionCookieOptions())
    res.json({ user: { id: session.sub, name: session.name, role: session.role } })
  }),
)

const ownerSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(6, 'Password is too short.').max(200),
})

authRouter.post(
  '/owner',
  asyncHandler(async (req, res) => {
    const ip = req.ip ?? 'unknown'
    guardRate(ip, 'owner')
    const body = parseBody(ownerSchema, req.body)

    const session = await loginOwner(body.email, body.password)
    reset(`login:owner:${ip}`)

    res.cookie(SESSION_COOKIE, createSessionToken(session), sessionCookieOptions())
    res.json({ user: { id: session.sub, name: session.name, role: session.role } })
  }),
)

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, clearCookieOptions())
  res.json({ ok: true })
})

/** 200 with a null user when signed out, so the app can boot in one request. */
authRouter.get('/me', (req, res) => {
  const session = req.session
  res.json({
    user: session ? { id: session.sub, name: session.name, role: session.role } : null,
  })
})

authRouter.get(
  '/session',
  requireAuth,
  asyncHandler(async (req, res) => {
    const session = actor(req)
    res.json({ user: { id: session.sub, name: session.name, role: session.role } })
  }),
)
