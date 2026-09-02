import { Router } from 'express'
import { z } from 'zod'

import { buildBill } from '../lib/bill'
import { asyncHandler, intParam, parseBody, strParam } from '../lib/http'
import { actor, requireAuth } from '../middleware/auth'
import {
  deliverBill,
  emailChannel,
  listDeliveries,
  publicBill,
  upiQrFor,
  whatsappChannel,
} from '../services/delivery'
import { assertAccess, findOrder, getOrderByToken } from '../services/orders'
import { getSettings } from '../services/settings'

export const billRouter = Router()

/**
 * No login: the token is the credential. It is 128 bits of randomness, only ever
 * handed to the guest, and the page it opens shows nothing but their own bill.
 */
billRouter.get(
  '/public/:token',
  asyncHandler(async (req, res) => {
    const token = strParam(req.params.token)
    const [detail, config] = await Promise.all([getOrderByToken(token), getSettings()])
    res.json({ bill: publicBill(buildBill(detail, config)) })
  }),
)

billRouter.use(requireAuth)

async function guard(req: Parameters<typeof actor>[0], id: number): Promise<void> {
  assertAccess(await findOrder(id), actor(req))
}

billRouter.post(
  '/:id/whatsapp',
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id)
    await guard(req, id)
    const body = parseBody(z.object({ phone: z.string().trim().min(6).max(20) }), req.body)
    res.json({ delivery: await deliverBill(id, whatsappChannel, body.phone) })
  }),
)

billRouter.post(
  '/:id/email',
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id)
    await guard(req, id)
    const body = parseBody(z.object({ email: z.string().trim().min(5).max(254) }), req.body)
    res.json({ delivery: await deliverBill(id, emailChannel, body.email) })
  }),
)

billRouter.get(
  '/:id/deliveries',
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id)
    await guard(req, id)
    res.json({ deliveries: await listDeliveries(id) })
  }),
)

billRouter.get(
  '/:id/upi-qr',
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id)
    await guard(req, id)
    res.json(await upiQrFor(id))
  }),
)
