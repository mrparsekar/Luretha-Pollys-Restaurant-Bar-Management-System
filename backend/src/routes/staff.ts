import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler, intParam, parseBody } from '../lib/http.js'
import { actor, requireAuth, requireOwner } from '../middleware/auth.js'
import {
  createStaff,
  listStaff,
  setPassword,
  setPin,
  unlockStaff,
  updateStaff,
} from '../services/staff.js'

export const staffRouter = Router()

staffRouter.use(requireAuth, requireOwner)

staffRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ staff: await listStaff() })
  }),
)

const pin = z.string().regex(/^\d{4,6}$/, 'A PIN must be 4 to 6 digits.')

const newStaffBody = z.object({
  name: z.string().trim().min(2).max(60),
  role: z.enum(['owner', 'waiter']),
  email: z.string().trim().max(254).nullish(),
  password: z.string().min(8, 'Use at least 8 characters.').max(200).nullish(),
  pin: pin.nullish(),
})

staffRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(newStaffBody, req.body)
    res.status(201).json({ member: await createStaff(body, actor(req)) })
  }),
)

staffRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        name: z.string().trim().min(2).max(60).optional(),
        email: z.string().trim().max(254).nullish(),
        isActive: z.boolean().optional(),
        role: z.enum(['owner', 'waiter']).optional(),
      }),
      req.body,
    )
    res.json({ member: await updateStaff(intParam(req.params.id), body, actor(req)) })
  }),
)

staffRouter.post(
  '/:id/pin',
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ pin }), req.body)
    await setPin(intParam(req.params.id), body.pin, actor(req))
    res.json({ ok: true })
  }),
)

staffRouter.post(
  '/:id/password',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({ password: z.string().min(8, 'Use at least 8 characters.').max(200) }),
      req.body,
    )
    await setPassword(intParam(req.params.id), body.password, actor(req))
    res.json({ ok: true })
  }),
)

staffRouter.post(
  '/:id/unlock',
  asyncHandler(async (req, res) => {
    await unlockStaff(intParam(req.params.id), actor(req))
    res.json({ ok: true })
  }),
)
