import { Router } from 'express'
import { z } from 'zod'

import { buildBill } from '../lib/bill'
import { ApiError, asyncHandler, intParam, parseBody, parseQuery } from '../lib/http'
import { MAX_ITEM_PRICE_PAISE } from '../lib/money'
import { isDateString } from '../lib/time'
import { actor, requireAuth, requireOwner } from '../middleware/auth'
import {
  addItems,
  assertAccess,
  changeTable,
  findOrder,
  getOrderDetail,
  listKitchenTickets,
  listOrders,
  listRunningOrders,
  markBilled,
  openOrder,
  serveItem,
  setDiscount,
  settleOrder,
  updateGuest,
  voidItem,
  voidOrder,
} from '../services/orders'
import { getSettings } from '../services/settings'

export const orderRouter = Router()

orderRouter.use(requireAuth)

/** Waiters are pinned to their own orders; only the owner may look wider. */
function scopeWaiter(req: Parameters<typeof actor>[0]): number | undefined {
  const session = actor(req)
  return session.role === 'owner' ? undefined : session.sub
}

orderRouter.get(
  '/running',
  asyncHandler(async (req, res) => {
    res.json({ orders: await listRunningOrders(scopeWaiter(req)) })
  }),
)

const listQuery = z.object({
  status: z.string().trim().optional(),
  date: z.string().trim().optional(),
  waiterId: z.coerce.number().int().positive().optional(),
})

orderRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parseQuery(listQuery, req.query)
    const session = actor(req)

    const statuses = query.status
      ? query.status
          .split(',')
          .map((value) => value.trim())
          .filter((value): value is 'open' | 'billed' | 'settled' | 'void' =>
            ['open', 'billed', 'settled', 'void'].includes(value),
          )
      : undefined

    if (query.date && !isDateString(query.date)) throw ApiError.badRequest('Invalid date.')

    res.json({
      orders: await listOrders({
        statuses,
        businessDate: query.date,
        waiterId: session.role === 'owner' ? query.waiterId : session.sub,
      }),
    })
  }),
)

orderRouter.get(
  '/kitchen',
  asyncHandler(async (req, res) => {
    const group = req.query.group === 'bar' ? 'bar' : req.query.group === 'kitchen' ? 'kitchen' : undefined
    res.json({ tickets: await listKitchenTickets(group) })
  }),
)

const openBody = z.object({
  orderType: z.enum(['dine_in', 'takeaway']).default('dine_in'),
  diningTableId: z.number().int().positive().nullish(),
  guests: z.number().int().min(0).max(60).optional(),
  guestName: z.string().trim().max(80).nullish(),
})

orderRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(openBody, req.body)
    const order = await openOrder(body, actor(req))
    res.status(201).json({ order })
  }),
)

/** Detail carries the priced bill too, so print and settle need no second call. */
orderRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id)
    const order = await findOrder(id)
    assertAccess(order, actor(req))

    const [detail, config] = await Promise.all([getOrderDetail(id), getSettings()])
    res.json({
      order: detail.order,
      items: detail.items,
      tableLabel: detail.tableLabel,
      waiterName: detail.waiterName,
      bill: buildBill(detail, config),
    })
  }),
)

const itemsBody = z.object({
  items: z
    .array(
      z.object({
        menuItemId: z.number().int().positive(),
        variantId: z.number().int().positive().nullish(),
        qty: z.number().int().min(1).max(99),
        note: z.string().trim().max(200).nullish(),
        unitPricePaise: z.number().int().min(1).max(MAX_ITEM_PRICE_PAISE).nullish(),
      }),
    )
    .min(1, 'Add at least one item.')
    .max(60),
})

orderRouter.post(
  '/:id/items',
  asyncHandler(async (req, res) => {
    const body = parseBody(itemsBody, req.body)
    const result = await addItems(intParam(req.params.id), body.items, actor(req))
    res.status(201).json({ order: result.order, roundNo: result.roundNo })
  }),
)

const reasonBody = z.object({ reason: z.string().trim().min(3, 'Give a short reason.').max(200) })

orderRouter.post(
  '/:id/items/:itemId/void',
  asyncHandler(async (req, res) => {
    const body = parseBody(reasonBody, req.body)
    const order = await voidItem(
      intParam(req.params.id),
      intParam(req.params.itemId, 'item'),
      body.reason,
      actor(req),
    )
    res.json({ order })
  }),
)

orderRouter.post(
  '/:id/items/:itemId/served',
  asyncHandler(async (req, res) => {
    await serveItem(intParam(req.params.id), intParam(req.params.itemId, 'item'))
    res.json({ ok: true })
  }),
)

const guestBody = z.object({
  guestName: z.string().trim().max(80).nullish(),
  guestPhone: z.string().trim().max(20).nullish(),
  guestEmail: z.string().trim().max(254).nullish(),
  guests: z.number().int().min(0).max(60).optional(),
  notes: z.string().trim().max(300).nullish(),
})

orderRouter.patch(
  '/:id/guest',
  asyncHandler(async (req, res) => {
    const body = parseBody(guestBody, req.body)
    res.json({ order: await updateGuest(intParam(req.params.id), body, actor(req)) })
  }),
)

orderRouter.post(
  '/:id/discount',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        discountType: z.enum(['none', 'amount', 'percent']),
        discountValue: z.number().int().min(0).max(MAX_ITEM_PRICE_PAISE),
      }),
      req.body,
    )
    res.json({ order: await setDiscount(intParam(req.params.id), body, actor(req)) })
  }),
)

orderRouter.post(
  '/:id/bill',
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id)
    await markBilled(id, actor(req))
    const [detail, config] = await Promise.all([getOrderDetail(id), getSettings()])
    res.json({ order: detail.order, bill: buildBill(detail, config) })
  }),
)

const settleBody = z.object({
  paymentMode: z.enum(['cash', 'upi']),
  guestName: z.string().trim().max(80).nullish(),
  guestPhone: z.string().trim().max(20).nullish(),
  guestEmail: z.string().trim().max(254).nullish(),
})

orderRouter.post(
  '/:id/settle',
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id)
    const body = parseBody(settleBody, req.body)
    await settleOrder(id, body, actor(req))
    const [detail, config] = await Promise.all([getOrderDetail(id), getSettings()])
    res.json({ order: detail.order, bill: buildBill(detail, config) })
  }),
)

orderRouter.post(
  '/:id/void',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(reasonBody, req.body)
    res.json({ order: await voidOrder(intParam(req.params.id), body.reason, actor(req)) })
  }),
)

orderRouter.post(
  '/:id/table',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ diningTableId: z.number().int().positive() }), req.body)
    res.json({ order: await changeTable(intParam(req.params.id), body.diningTableId, actor(req)) })
  }),
)
