import { Router } from 'express'
import { z } from 'zod'

import { ApiError, asyncHandler, intParam, parseBody, strParam } from '../lib/http.js'
import { qrDataUrl, specialsUrlFor } from '../lib/bill.js'
import { isDateString } from '../lib/time.js'
import { MAX_ITEM_PRICE_PAISE } from '../lib/money.js'
import { requireAuth, requireOwner } from '../middleware/auth.js'
import {
  addCustomSpecial,
  addMenuItemSpecial,
  listActiveSpecials,
  listAllSpecials,
  listLiveSpecialGalleryImages,
  listSpecialGalleryImages,
  listSpecialGalleryHistory,
  removeSpecial,
  replaceSpecialGalleryImages,
  specialsHistory,
  updateSpecialDays,
} from '../services/specials.js'
import { getSettings } from '../services/settings.js'

export const specialsRouter = Router()

const daysOfWeek = z.array(z.number().int().min(0).max(6)).max(7).nullish()
const galleryImage = z.string().refine(
  (value) => (value.startsWith('data:image/') && value.includes(';base64,')) || /^https:\/\/res\.cloudinary\.com\//i.test(value),
  'Use an image upload or a Cloudinary image URL.',
)

/**
 * The page every table's QR code opens. One page for the whole restaurant - the
 * specials are the same no matter which table scanned it - so there is nothing
 * to look up and nothing to get wrong by scanning the "wrong" table's code.
 */
specialsRouter.get(
  '/public',
  asyncHandler(async (_req, res) => {
    const [settings, items, images] = await Promise.all([
      getSettings(),
      listActiveSpecials(),
      listLiveSpecialGalleryImages(),
    ])
    res.json({ restaurantName: settings.restaurantName, tagline: settings.tagline, items, images })
  }),
)

specialsRouter.use(requireAuth, requireOwner)

/** The owner's whole plan - every active entry, any day - not just what's live today. */
specialsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ items: await listAllSpecials() })
  }),
)

/** What was actually shown on a past (or future) date - a read-only log. */
specialsRouter.get(
  '/history/:date',
  asyncHandler(async (req, res) => {
    const date = strParam(req.params.date)
    if (!isDateString(date)) throw ApiError.badRequest('Use a date like 2026-10-04.')
    res.json({ date, items: await specialsHistory(date) })
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

specialsRouter.get(
  '/gallery',
  asyncHandler(async (_req, res) => {
    res.json({ images: await listSpecialGalleryImages() })
  }),
)

specialsRouter.get(
  '/gallery/history',
  asyncHandler(async (_req, res) => {
    res.json({ galleries: await listSpecialGalleryHistory() })
  }),
)

specialsRouter.put(
  '/gallery',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        images: z.array(galleryImage).max(10),
      }),
      req.body,
    )
    const totalBytes = body.images.reduce((sum, image) => sum + Buffer.byteLength(image, 'utf8'), 0)
    if (totalBytes > 25 * 1024 * 1024) throw ApiError.badRequest('Please keep the gallery under 25 MB.')
    await replaceSpecialGalleryImages(body.images)
    res.json({ images: await listSpecialGalleryImages() })
  }),
)

specialsRouter.post(
  '/menu-item',
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ menuItemId: z.number().int().positive() }), req.body)
    await addMenuItemSpecial(body.menuItemId)
    res.status(201).json({ items: await listAllSpecials() })
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
        isVeg: z.boolean().nullish(),
      }),
      req.body,
    )
    await addCustomSpecial(body)
    res.status(201).json({ items: await listAllSpecials() })
  }),
)

specialsRouter.patch(
  '/:id/days',
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ daysOfWeek }), req.body)
    await updateSpecialDays(intParam(req.params.id), body.daysOfWeek ?? null)
    res.json({ items: await listAllSpecials() })
  }),
)

specialsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await removeSpecial(intParam(req.params.id))
    res.json({ ok: true })
  }),
)
