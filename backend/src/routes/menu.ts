import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler, intParam, parseBody } from '../lib/http'
import { MAX_ITEM_PRICE_PAISE } from '../lib/money'
import { actor, requireAuth, requireOwner } from '../middleware/auth'
import {
  addVariant,
  createCategory,
  createItem,
  deleteItem,
  deleteVariant,
  getMenu,
  listCategories,
  priceVerificationSheet,
  reorderItems,
  updateCategory,
  updateItem,
  updateVariant,
} from '../services/menu'

export const menuRouter = Router()

// The card itself is staff-only; editing it is owner-only.
menuRouter.use(requireAuth)

const groupEnum = z.enum(['breakfast', 'food', 'bar', 'beverage', 'dessert'])
const priceModeEnum = z.enum(['fixed', 'variant', 'ask'])
const clock = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use HH:MM, e.g. 19:00')
const price = z.number().int().min(0).max(MAX_ITEM_PRICE_PAISE)

menuRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ menu: await getMenu() })
  }),
)

menuRouter.get(
  '/verification-sheet',
  requireOwner,
  asyncHandler(async (_req, res) => {
    res.json({ sections: await priceVerificationSheet() })
  }),
)

menuRouter.get(
  '/categories',
  requireOwner,
  asyncHandler(async (_req, res) => {
    res.json({ categories: await listCategories() })
  }),
)

const categoryBody = z.object({
  name: z.string().trim().min(1).max(80),
  group: groupEnum,
  note: z.string().trim().max(200).nullish(),
  sort: z.number().int().min(0).max(9999).optional(),
})

menuRouter.post(
  '/categories',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(categoryBody, req.body)
    res.status(201).json({ category: await createCategory(body) })
  }),
)

menuRouter.patch(
  '/categories/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(categoryBody.partial().extend({ isActive: z.boolean().optional() }), req.body)
    res.json({ category: await updateCategory(intParam(req.params.id), body) })
  }),
)

const itemBody = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).nullish(),
  priceMode: priceModeEnum.optional(),
  basePricePaise: price.nullish(),
  isVeg: z.boolean().nullish(),
  available: z.boolean().optional(),
  availFrom: clock.nullish(),
  availTo: clock.nullish(),
  note: z.string().trim().max(200).nullish(),
  sort: z.number().int().min(0).max(9999).optional(),
})

menuRouter.post(
  '/items',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(itemBody, req.body)
    res.status(201).json({ item: await createItem(body, actor(req)) })
  }),
)

menuRouter.patch(
  '/items/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(itemBody.partial(), req.body)
    res.json({ item: await updateItem(intParam(req.params.id), body, actor(req)) })
  }),
)

menuRouter.delete(
  '/items/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    await deleteItem(intParam(req.params.id), actor(req))
    res.json({ ok: true })
  }),
)

const variantBody = z.object({
  label: z.string().trim().min(1).max(40),
  pricePaise: price.nullable(),
  sort: z.number().int().min(0).max(9999).optional(),
})

menuRouter.post(
  '/items/:id/variants',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(variantBody, req.body)
    res.status(201).json({ variant: await addVariant(intParam(req.params.id), body, actor(req)) })
  }),
)

menuRouter.patch(
  '/variants/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(variantBody.partial(), req.body)
    res.json({ variant: await updateVariant(intParam(req.params.id), body, actor(req)) })
  }),
)

menuRouter.delete(
  '/variants/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    await deleteVariant(intParam(req.params.id), actor(req))
    res.json({ ok: true })
  }),
)

menuRouter.post(
  '/reorder',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        items: z
          .array(z.object({ id: z.number().int().positive(), sort: z.number().int().min(0).max(9999) }))
          .max(1000),
      }),
      req.body,
    )
    await reorderItems(body.items)
    res.json({ ok: true })
  }),
)
