import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler, intParam, parseBody } from '../lib/http.js'
import { qrDataUrl, specialsUrlFor } from '../lib/bill.js'
import { MAX_ITEM_PRICE_PAISE } from '../lib/money.js'
import { requireAuth, requireOwner } from '../middleware/auth.js'
import { addCustomSpecial, addMenuItemSpecial, listSpecials, removeSpecial } from '../services/specials.js'
import { getSettings } from '../services/settings.js'

export const specialsRouter = Router()

/**
 * The page every table's QR code opens. One page for the whole restaurant - the
 * specials are the same no matter which table scanned it - so there is nothing
 * to look up and nothing to get wrong by scanning the "wrong" table's code.
 */
specialsRouter.get(
  '/public',
  asyncHandler(async (_req, res) => {
    const [settings, items] = await Promise.all([getSettings(), listSpecials()])
    res.json({ restaurantName: settings.restaurantName, tagline: settings.tagline, items })
  }),
)

specialsRouter.use(requireAuth, requireOwner)

specialsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ items: await listSpecials() })
  }),
)

/** The one QR the owner prints and sticks on every table. */
specialsRouter.get(
  '/qr',
  asyncHandler(async (_req, res) => {
    const url = specialsUrlFor()
    res.json({ dataUrl: await qrDataUrl(url), url })
  }),
)

specialsRouter.post(
  '/menu-item',
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ menuItemId: z.number().int().positive() }), req.body)
    await addMenuItemSpecial(body.menuItemId)
    res.status(201).json({ items: await listSpecials() })
  }),
)

const price = z.number().int().min(0).max(MAX_ITEM_PRICE_PAISE)

specialsRouter.post(
  '/custom',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(300).nullish(),
        pricePaise: price.nullish(),
      }),
      req.body,
    )
    await addCustomSpecial(body)
    res.status(201).json({ items: await listSpecials() })
  }),
)

specialsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await removeSpecial(intParam(req.params.id))
    res.json({ ok: true })
  }),
)
