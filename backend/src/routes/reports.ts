import { Router } from 'express'
import { z } from 'zod'

import { listAuditLog } from '../lib/audit'
import { csvRupees, toCsv } from '../lib/csv'
import { asyncHandler, parseQuery } from '../lib/http'
import { dateStringLabel } from '../lib/time'
import { requireAuth, requireOwner } from '../middleware/auth'
import {
  categoryWise,
  dailyBreakdown,
  daySheet,
  hourly,
  itemWise,
  resolveRange,
  settledOrders,
  waiterWise,
} from '../services/reports'

export const reportRouter = Router()

// Numbers are the owner's business, not the floor's.
reportRouter.use(requireAuth, requireOwner)

const rangeQuery = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
})

reportRouter.get(
  '/day-sheet',
  asyncHandler(async (req, res) => {
    const query = parseQuery(rangeQuery, req.query)
    const range = await resolveRange(query.from, query.to)
    res.json({ sheet: await daySheet(range) })
  }),
)

/** One call behind the whole reports screen: fewer round trips on a phone. */
reportRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const query = parseQuery(rangeQuery, req.query)
    const range = await resolveRange(query.from, query.to)

    const [sheet, daily, categories, waiters, hours, items] = await Promise.all([
      daySheet(range),
      dailyBreakdown(range),
      categoryWise(range),
      waiterWise(range),
      hourly(range),
      itemWise(range, 25),
    ])

    res.json({ range, sheet, daily, categories, waiters, hours, topItems: items })
  }),
)

reportRouter.get(
  '/items',
  asyncHandler(async (req, res) => {
    const query = parseQuery(rangeQuery, req.query)
    const range = await resolveRange(query.from, query.to)
    res.json({ range, items: await itemWise(range) })
  }),
)

reportRouter.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const query = parseQuery(rangeQuery, req.query)
    const range = await resolveRange(query.from, query.to)
    res.json({ range, orders: await settledOrders(range) })
  }),
)

reportRouter.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const query = parseQuery(
      z.object({ limit: z.coerce.number().int().min(1).max(500).optional(), action: z.string().trim().max(40).optional() }),
      req.query,
    )
    res.json({ entries: await listAuditLog(query) })
  }),
)

const exportQuery = rangeQuery.extend({
  type: z.enum(['orders', 'items', 'daily', 'categories', 'waiters', 'hours']).default('orders'),
})

reportRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const query = parseQuery(exportQuery, req.query)
    const range = await resolveRange(query.from, query.to)

    let headers: string[] = []
    let rows: unknown[][] = []

    if (query.type === 'items') {
      headers = ['Item', 'Size', 'Section', 'Group', 'Qty', 'Amount']
      rows = (await itemWise(range)).map((row) => [
        row.name,
        row.variant ?? '',
        row.category,
        row.group,
        row.qty,
        csvRupees(row.amountPaise),
      ])
    } else if (query.type === 'daily') {
      headers = ['Date', 'Orders', 'Covers', 'Cash', 'UPI', 'Total']
      rows = (await dailyBreakdown(range)).map((row) => [
        dateStringLabel(row.businessDate),
        row.orders,
        row.covers,
        csvRupees(row.cashPaise),
        csvRupees(row.upiPaise),
        csvRupees(row.netPaise),
      ])
    } else if (query.type === 'categories') {
      headers = ['Section', 'Group', 'Qty', 'Amount']
      rows = (await categoryWise(range)).map((row) => [
        row.category,
        row.group,
        row.qty,
        csvRupees(row.amountPaise),
      ])
    } else if (query.type === 'waiters') {
      headers = ['Waiter', 'Orders', 'Covers', 'Total', 'Average bill']
      rows = (await waiterWise(range)).map((row) => [
        row.name,
        row.orders,
        row.covers,
        csvRupees(row.netPaise),
        csvRupees(row.averageBillPaise),
      ])
    } else if (query.type === 'hours') {
      headers = ['Hour', 'Items', 'Amount']
      rows = (await hourly(range)).map((row) => [row.label, row.qty, csvRupees(row.amountPaise)])
    } else {
      headers = [
        'Date',
        'Order no',
        'Table',
        'Waiter',
        'Covers',
        'Subtotal',
        'Discount',
        'Tax',
        'Total',
        'Payment',
        'Settled at',
      ]
      rows = (await settledOrders(range)).map((row) => [
        dateStringLabel(row.businessDate),
        row.orderNo,
        row.table ?? 'Takeaway',
        row.waiter,
        row.guests,
        csvRupees(row.subtotalPaise),
        csvRupees(row.discountPaise),
        csvRupees(row.taxPaise),
        csvRupees(row.totalPaise),
        row.paymentMode ?? '',
        row.settledAt ? row.settledAt.toISOString() : '',
      ])
    }

    const name = `luretha-${query.type}-${range.from}-to-${range.to}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
    res.send(toCsv(headers, rows))
  }),
)
