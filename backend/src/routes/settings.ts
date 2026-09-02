import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler, parseBody } from '../lib/http'
import { mailStatus } from '../lib/mail'
import { actor, isOwner, requireAuth, requireOwner } from '../middleware/auth'
import { getSettings, updateSettings } from '../services/settings'

export const settingsRouter = Router()

settingsRouter.use(requireAuth)

/**
 * Every screen needs the restaurant header and the tax flags, so this is readable
 * by any signed-in staff member. Only the owner can write.
 */
settingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const row = await getSettings()
    res.json({ settings: row, mail: isOwner(req) ? mailStatus() : undefined })
  }),
)

const text = (max: number) => z.string().trim().max(max)
/** 10000 bps = 100%: a rate above that is a typo, not a tax. */
const bps = z.coerce.number().int().min(0).max(10_000)

const settingsBody = z.object({
  restaurantName: text(120).min(2).optional(),
  tagline: text(120).nullish(),
  address: text(300).nullish(),
  phonePrimary: text(20).nullish(),
  phoneSecondary: text(20).nullish(),
  instagram: text(60).nullish(),
  upiId: text(120).nullish(),
  upiPayeeName: text(60).nullish(),
  reviewUrl: text(400).nullish(),
  billFooter: text(300).nullish(),
  taxEnabled: z.boolean().optional(),
  foodTaxBps: bps.optional(),
  liquorTaxBps: bps.optional(),
  serviceChargeBps: bps.optional(),
  businessDayStartHour: z.coerce.number().int().min(0).max(23).optional(),
})

settingsRouter.patch(
  '/',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(settingsBody, req.body)
    // Empty strings from a form mean "clear this", not "store a blank".
    const patch = Object.fromEntries(
      Object.entries(body).map(([key, value]) => [key, value === '' ? null : value]),
    )
    res.json({ settings: await updateSettings(patch, actor(req)) })
  }),
)
