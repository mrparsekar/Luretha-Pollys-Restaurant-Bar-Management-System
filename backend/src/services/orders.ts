import { randomBytes } from 'node:crypto'

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

import { db } from '../db'
import {
  categories,
  dailyCounters,
  diningTables,
  itemVariants,
  menuItems,
  orderItems,
  orders,
  staff,
  type MenuGroup,
  type Order,
  type Settings,
} from '../db/schema'
import { recordAudit } from '../lib/audit'
import { ApiError } from '../lib/http'
import { computeTotals, MAX_ITEM_PRICE_PAISE } from '../lib/money'
import type { SessionPayload } from '../lib/session'
import { businessDate, formatClock, isWithinWindow } from '../lib/time'
import { getSettings, taxConfigOf } from './settings'

export type NewItemInput = {
  menuItemId: number
  variantId?: number | null
  qty: number
  note?: string | null
  /** Required for ask-price items and for variants printed without a price. */
  unitPricePaise?: number | null
}

type ResolvedLine = {
  menuItemId: number
  variantId: number | null
  nameSnapshot: string
  variantSnapshot: string | null
  categorySnapshot: string
  groupSnapshot: MenuGroup
  unitPricePaise: number
  qty: number
  note: string | null
  /** True when the waiter keyed the price in, so it can be audited. */
  askedPrice: boolean
}

/** Waiters see and touch only their own orders; the owner sees everything. */
export function assertAccess(order: Order, session: SessionPayload): void {
  if (session.role === 'owner') return
  if (order.waiterId !== session.sub) {
    throw ApiError.forbidden('This order belongs to another waiter.')
  }
}

export function assertMutable(order: Order): void {
  if (order.status === 'settled') throw ApiError.conflict('This order is already settled.')
  if (order.status === 'void') throw ApiError.conflict('This order was cancelled.')
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * One UPSERT ... RETURNING, so two waiters opening a table in the same second
 * cannot collide: Postgres serialises the row and each gets its own number.
 */
async function nextOrderNo(tx: Tx, date: string): Promise<number> {
  const rows = await tx
    .insert(dailyCounters)
    .values({ businessDate: date, lastOrderNo: 1 })
    .onConflictDoUpdate({
      target: dailyCounters.businessDate,
      set: { lastOrderNo: sql`${dailyCounters.lastOrderNo} + 1` },
    })
    .returning({ lastOrderNo: dailyCounters.lastOrderNo })
  const no = rows[0]?.lastOrderNo
  if (!no) throw new Error('Could not allocate an order number')
  return no
}

export type OpenOrderInput = {
  orderType: 'dine_in' | 'takeaway'
  diningTableId?: number | null
  guests?: number
  guestName?: string | null
}

export async function openOrder(input: OpenOrderInput, session: SessionPayload): Promise<Order> {
  const config = await getSettings()
  const date = businessDate(new Date(), config.businessDayStartHour)

  return db.transaction(async (tx) => {
    let tableId: number | null = null

    if (input.orderType === 'dine_in') {
      if (!input.diningTableId) throw ApiError.badRequest('Pick a table first.')
      const table = (
        await tx.select().from(diningTables).where(eq(diningTables.id, input.diningTableId)).limit(1)
      )[0]
      if (!table || !table.isActive) throw ApiError.notFound('That table is not available.')

      const busy = (
        await tx
          .select({ id: orders.id, orderNo: orders.orderNo })
          .from(orders)
          .where(and(eq(orders.diningTableId, table.id), inArray(orders.status, ['open', 'billed'])))
          .limit(1)
      )[0]
      if (busy) {
        throw ApiError.conflict(`${table.label} already has order #${busy.orderNo} running.`, {
          orderId: busy.id,
        })
      }
      tableId = table.id
    }

    const orderNo = await nextOrderNo(tx, date)
    const created = (
      await tx
        .insert(orders)
        .values({
          orderNo,
          businessDate: date,
          orderType: input.orderType,
          diningTableId: tableId,
          waiterId: session.sub,
          guests: input.guests ?? 0,
          guestName: input.guestName ?? null,
        })
        .returning()
    )[0]
    if (!created) throw new Error('Could not open the order')
    return created
  })
}

async function resolveLines(
  tx: Tx,
  inputs: readonly NewItemInput[],
  at: Date,
): Promise<ResolvedLine[]> {
  if (inputs.length === 0) throw ApiError.badRequest('Add at least one item.')

  const itemIds = [...new Set(inputs.map((i) => i.menuItemId))]
  const rows = await tx
    .select({
      id: menuItems.id,
      name: menuItems.name,
      priceMode: menuItems.priceMode,
      basePricePaise: menuItems.basePricePaise,
      available: menuItems.available,
      availFrom: menuItems.availFrom,
      availTo: menuItems.availTo,
      categoryName: categories.name,
      group: categories.group,
    })
    .from(menuItems)
    .innerJoin(categories, eq(menuItems.categoryId, categories.id))
    .where(inArray(menuItems.id, itemIds))
  const itemById = new Map(rows.map((row) => [row.id, row]))

  const variantIds = [
    ...new Set(inputs.map((i) => i.variantId).filter((v): v is number => typeof v === 'number')),
  ]
  const variantRows = variantIds.length
    ? await tx.select().from(itemVariants).where(inArray(itemVariants.id, variantIds))
    : []
  const variantById = new Map(variantRows.map((row) => [row.id, row]))

  return inputs.map((input) => {
    const item = itemById.get(input.menuItemId)
    if (!item) throw ApiError.notFound('That item is no longer on the menu.')
    if (!item.available) throw ApiError.conflict(`${item.name} is off the menu right now.`)
    if (!isWithinWindow(item.availFrom, item.availTo, at)) {
      const window = `${formatClock(item.availFrom) || 'open'} to ${formatClock(item.availTo) || 'close'}`
      throw ApiError.conflict(`${item.name} is served ${window} only.`)
    }

    const qty = Math.trunc(input.qty)
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw ApiError.badRequest(`Quantity for ${item.name} must be between 1 and 99.`)
    }

    let variantLabel: string | null = null
    let variantId: number | null = null
    let menuPrice: number | null = null

    if (item.priceMode === 'variant') {
      if (!input.variantId) throw ApiError.badRequest(`Choose a size for ${item.name}.`)
      const variant = variantById.get(input.variantId)
      if (!variant || variant.itemId !== item.id) {
        throw ApiError.badRequest(`That size is not available for ${item.name}.`)
      }
      variantId = variant.id
      variantLabel = variant.label
      menuPrice = variant.pricePaise
    } else if (item.priceMode === 'fixed') {
      menuPrice = item.basePricePaise
    }

    const typed = input.unitPricePaise
    let unitPricePaise: number
    let askedPrice = false

    if (menuPrice != null) {
      unitPricePaise = menuPrice
    } else {
      // Ask-price seafood, and the few rows the printed menu leaves blank.
      if (typed == null) {
        const what = variantLabel ? `${item.name} (${variantLabel})` : item.name
        throw ApiError.badRequest(`Enter the price for ${what}.`)
      }
      unitPricePaise = Math.trunc(typed)
      askedPrice = true
      if (unitPricePaise <= 0 || unitPricePaise > MAX_ITEM_PRICE_PAISE) {
        throw ApiError.badRequest(`That price looks wrong for ${item.name}.`)
      }
    }

    const note = input.note?.trim() ? input.note.trim().slice(0, 200) : null

    return {
      menuItemId: item.id,
      variantId,
      nameSnapshot: item.name,
      variantSnapshot: variantLabel,
      categorySnapshot: item.categoryName,
      groupSnapshot: item.group,
      unitPricePaise,
      qty,
      note,
      askedPrice,
    }
  })
}

async function loadOrder(tx: Tx, id: number, lock = false): Promise<Order> {
  const base = tx.select().from(orders).where(eq(orders.id, id)).limit(1)
  const rows = lock ? await base.for('update') : await base
  const order = rows[0]
  if (!order) throw ApiError.notFound('Order not found.')
  return order
}

/** Single source of truth for the money on an order. Called after every change. */
async function recompute(tx: Tx, order: Order, config: Settings): Promise<Order> {
  const lines = await tx
    .select({
      groupSnapshot: orderItems.groupSnapshot,
      unitPricePaise: orderItems.unitPricePaise,
      qty: orderItems.qty,
      status: orderItems.status,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))

  const totals = computeTotals(
    lines,
    { discountType: order.discountType, discountValue: order.discountValue },
    taxConfigOf(config),
  )

  const updated = (
    await tx
      .update(orders)
      .set({
        subtotalPaise: totals.subtotalPaise,
        discountPaise: totals.discountPaise,
        taxPaise: totals.taxPaise,
        serviceChargePaise: totals.serviceChargePaise,
        roundOffPaise: totals.roundOffPaise,
        totalPaise: totals.totalPaise,
      })
      .where(eq(orders.id, order.id))
      .returning()
  )[0]
  if (!updated) throw new Error('Could not update the order total')
  return updated
}

export async function addItems(
  orderId: number,
  inputs: readonly NewItemInput[],
  session: SessionPayload,
): Promise<{ order: Order; roundNo: number }> {
  const config = await getSettings()
  const now = new Date()

  const result = await db.transaction(async (tx) => {
    const order = await loadOrder(tx, orderId, true)
    assertAccess(order, session)
    assertMutable(order)

    const resolved = await resolveLines(tx, inputs, now)

    const maxRound = await tx
      .select({ value: sql<number>`coalesce(max(${orderItems.roundNo}), 0)` })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
    const roundNo = Number(maxRound[0]?.value ?? 0) + 1

    await tx.insert(orderItems).values(
      resolved.map((line) => ({
        orderId: order.id,
        roundNo,
        menuItemId: line.menuItemId,
        variantId: line.variantId,
        nameSnapshot: line.nameSnapshot,
        variantSnapshot: line.variantSnapshot,
        categorySnapshot: line.categorySnapshot,
        groupSnapshot: line.groupSnapshot,
        unitPricePaise: line.unitPricePaise,
        qty: line.qty,
        note: line.note,
        createdById: session.sub,
      })),
    )

    // A guest who orders one more round after the bill was printed puts the order
    // back to open, so it gets re-billed at the right total instead of silently
    // carrying items the printed bill never showed.
    const reopen = order.status === 'billed' ? { status: 'open' as const, billedAt: null } : {}
    await tx
      .update(orders)
      .set({ lastItemAt: now, ...reopen })
      .where(eq(orders.id, order.id))

    const fresh = await loadOrder(tx, order.id)
    const updated = await recompute(tx, fresh, config)
    return { order: updated, roundNo, asked: resolved.filter((line) => line.askedPrice) }
  })

  for (const line of result.asked) {
    await recordAudit({
      actorId: session.sub,
      action: 'order_item.ask_price',
      entity: 'order',
      entityId: orderId,
      after: {
        name: line.nameSnapshot,
        variant: line.variantSnapshot,
        unitPricePaise: line.unitPricePaise,
        qty: line.qty,
        roundNo: result.roundNo,
      },
    })
  }

  return { order: result.order, roundNo: result.roundNo }
}

/**
 * The printed menu says a placed order cannot be cancelled, but staff do make
 * mistakes. A waiter may void on their own open order, the owner anywhere before
 * settle - and every void carries a reason into the audit log for review.
 */
export async function voidItem(
  orderId: number,
  itemId: number,
  reason: string,
  session: SessionPayload,
): Promise<Order> {
  const trimmed = reason.trim()
  if (trimmed.length < 3) throw ApiError.badRequest('Give a short reason for the void.')
  const config = await getSettings()

  const result = await db.transaction(async (tx) => {
    const order = await loadOrder(tx, orderId, true)
    assertAccess(order, session)
    assertMutable(order)

    const line = (
      await tx
        .select()
        .from(orderItems)
        .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, order.id)))
        .limit(1)
    )[0]
    if (!line) throw ApiError.notFound('That line is not on this order.')
    if (line.status === 'void') throw ApiError.conflict('That line is already void.')

    await tx
      .update(orderItems)
      .set({
        status: 'void',
        voidedById: session.sub,
        voidedAt: new Date(),
        voidReason: trimmed.slice(0, 200),
      })
      .where(eq(orderItems.id, line.id))

    return { order: await recompute(tx, order, config), line }
  })

  await recordAudit({
    actorId: session.sub,
    action: 'order_item.void',
    entity: 'order_item',
    entityId: itemId,
    before: {
      orderNo: result.order.orderNo,
      name: result.line.nameSnapshot,
      variant: result.line.variantSnapshot,
      qty: result.line.qty,
      unitPricePaise: result.line.unitPricePaise,
    },
    after: { reason: trimmed },
  })

  return result.order
}

/** Kitchen/bar pass: whoever is standing there taps ready, on any order. */
export async function serveItem(orderId: number, itemId: number): Promise<void> {
  const updated = await db
    .update(orderItems)
    .set({ status: 'served', servedAt: new Date() })
    .where(
      and(
        eq(orderItems.id, itemId),
        eq(orderItems.orderId, orderId),
        eq(orderItems.status, 'placed'),
      ),
    )
    .returning({ id: orderItems.id })
  if (!updated[0]) throw ApiError.notFound('That line is not waiting to be served.')
}

export type DiscountPatch = {
  discountType: 'none' | 'amount' | 'percent'
  /** Paise for 'amount', basis points for 'percent'. */
  discountValue: number
}

/** Owner only (enforced on the route). Always audited: this is money off the bill. */
export async function setDiscount(
  orderId: number,
  patch: DiscountPatch,
  session: SessionPayload,
): Promise<Order> {
  const value = Math.trunc(patch.discountValue)
  if (patch.discountType === 'none' && value !== 0) {
    throw ApiError.badRequest('Remove the discount value first.')
  }
  if (patch.discountType === 'percent' && (value < 0 || value > 10_000)) {
    throw ApiError.badRequest('Percent discount must be between 0 and 100.')
  }
  if (patch.discountType === 'amount' && (value < 0 || value > MAX_ITEM_PRICE_PAISE)) {
    throw ApiError.badRequest('That discount amount looks wrong.')
  }
  const config = await getSettings()

  const result = await db.transaction(async (tx) => {
    const order = await loadOrder(tx, orderId, true)
    assertMutable(order)

    const staged = (
      await tx
        .update(orders)
        .set({ discountType: patch.discountType, discountValue: value })
        .where(eq(orders.id, order.id))
        .returning()
    )[0]
    if (!staged) throw new Error('Could not apply the discount')

    return { before: order, order: await recompute(tx, staged, config) }
  })

  await recordAudit({
    actorId: session.sub,
    action: 'order.discount',
    entity: 'order',
    entityId: orderId,
    before: {
      discountType: result.before.discountType,
      discountValue: result.before.discountValue,
      discountPaise: result.before.discountPaise,
      totalPaise: result.before.totalPaise,
    },
    after: {
      orderNo: result.order.orderNo,
      discountType: result.order.discountType,
      discountValue: result.order.discountValue,
      discountPaise: result.order.discountPaise,
      totalPaise: result.order.totalPaise,
    },
  })

  return result.order
}

function newBillToken(): string {
  return randomBytes(16).toString('base64url')
}

async function liveLineCount(tx: Tx, orderId: number): Promise<number> {
  const rows = await tx
    .select({ value: sql<number>`count(*)` })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), sql`${orderItems.status} <> 'void'`))
  return Number(rows[0]?.value ?? 0)
}

/** Prints the bill: freezes nothing, but gives the order its public token. */
export async function markBilled(orderId: number, session: SessionPayload): Promise<Order> {
  const config = await getSettings()

  return db.transaction(async (tx) => {
    const order = await loadOrder(tx, orderId, true)
    assertAccess(order, session)
    assertMutable(order)

    if ((await liveLineCount(tx, order.id)) === 0) {
      throw ApiError.conflict('Nothing to bill - this order has no items.')
    }

    const priced = await recompute(tx, order, config)
    const updated = (
      await tx
        .update(orders)
        .set({
          status: 'billed',
          billedAt: priced.billedAt ?? new Date(),
          billToken: priced.billToken ?? newBillToken(),
        })
        .where(eq(orders.id, order.id))
        .returning()
    )[0]
    if (!updated) throw new Error('Could not mark the order billed')
    return updated
  })
}

export type SettleInput = {
  paymentMode: 'cash' | 'upi'
  guestName?: string | null
  guestPhone?: string | null
  guestEmail?: string | null
}

export async function settleOrder(
  orderId: number,
  input: SettleInput,
  session: SessionPayload,
): Promise<Order> {
  const config = await getSettings()

  const result = await db.transaction(async (tx) => {
    const order = await loadOrder(tx, orderId, true)
    assertMutable(order)

    if ((await liveLineCount(tx, order.id)) === 0) {
      throw ApiError.conflict('Nothing to settle - this order has no items.')
    }

    const priced = await recompute(tx, order, config)
    const now = new Date()
    const updated = (
      await tx
        .update(orders)
        .set({
          status: 'settled',
          paymentMode: input.paymentMode,
          guestName: input.guestName ?? priced.guestName,
          guestPhone: input.guestPhone ?? priced.guestPhone,
          guestEmail: input.guestEmail ?? priced.guestEmail,
          billedAt: priced.billedAt ?? now,
          settledAt: now,
          settledById: session.sub,
          billToken: priced.billToken ?? newBillToken(),
        })
        .where(eq(orders.id, order.id))
        .returning()
    )[0]
    if (!updated) throw new Error('Could not settle the order')
    return updated
  })

  await recordAudit({
    actorId: session.sub,
    action: 'order.settle',
    entity: 'order',
    entityId: orderId,
    after: {
      orderNo: result.orderNo,
      businessDate: result.businessDate,
      paymentMode: result.paymentMode,
      totalPaise: result.totalPaise,
    },
  })

  return result
}

/** Owner only. Cancels the whole tab (walkout, duplicate order) with a reason. */
export async function voidOrder(
  orderId: number,
  reason: string,
  session: SessionPayload,
): Promise<Order> {
  const trimmed = reason.trim()
  if (trimmed.length < 3) throw ApiError.badRequest('Give a short reason for cancelling.')

  const result = await db.transaction(async (tx) => {
    const order = await loadOrder(tx, orderId, true)
    if (order.status === 'settled') throw ApiError.conflict('A settled order cannot be cancelled.')
    if (order.status === 'void') throw ApiError.conflict('This order is already cancelled.')

    const updated = (
      await tx
        .update(orders)
        .set({ status: 'void', notes: trimmed.slice(0, 300) })
        .where(eq(orders.id, order.id))
        .returning()
    )[0]
    if (!updated) throw new Error('Could not cancel the order')
    return { before: order, order: updated }
  })

  await recordAudit({
    actorId: session.sub,
    action: 'order.void',
    entity: 'order',
    entityId: orderId,
    before: { status: result.before.status, totalPaise: result.before.totalPaise },
    after: { orderNo: result.order.orderNo, reason: trimmed },
  })

  return result.order
}

/** Owner only. Guests move tables; the tab follows them. */
export async function changeTable(
  orderId: number,
  diningTableId: number,
  session: SessionPayload,
): Promise<Order> {
  const result = await db.transaction(async (tx) => {
    const order = await loadOrder(tx, orderId, true)
    assertMutable(order)

    const table = (
      await tx.select().from(diningTables).where(eq(diningTables.id, diningTableId)).limit(1)
    )[0]
    if (!table || !table.isActive) throw ApiError.notFound('That table is not available.')

    const busy = (
      await tx
        .select({ id: orders.id, orderNo: orders.orderNo })
        .from(orders)
        .where(
          and(
            eq(orders.diningTableId, table.id),
            inArray(orders.status, ['open', 'billed']),
            sql`${orders.id} <> ${order.id}`,
          ),
        )
        .limit(1)
    )[0]
    if (busy) throw ApiError.conflict(`${table.label} already has order #${busy.orderNo} running.`)

    const updated = (
      await tx
        .update(orders)
        .set({ diningTableId: table.id, orderType: 'dine_in' })
        .where(eq(orders.id, order.id))
        .returning()
    )[0]
    if (!updated) throw new Error('Could not move the order')
    return { before: order, order: updated, label: table.label }
  })

  await recordAudit({
    actorId: session.sub,
    action: 'order.change_table',
    entity: 'order',
    entityId: orderId,
    before: { diningTableId: result.before.diningTableId },
    after: { diningTableId: result.order.diningTableId, label: result.label },
  })

  return result.order
}

export type GuestPatch = {
  guestName?: string | null
  guestPhone?: string | null
  guestEmail?: string | null
  guests?: number
  notes?: string | null
}

export async function updateGuest(
  orderId: number,
  patch: GuestPatch,
  session: SessionPayload,
): Promise<Order> {
  const order = await db.transaction(async (tx) => {
    const current = await loadOrder(tx, orderId, true)
    assertAccess(current, session)
    assertMutable(current)

    const updated = (
      await tx
        .update(orders)
        .set({
          guestName: patch.guestName ?? current.guestName,
          guestPhone: patch.guestPhone ?? current.guestPhone,
          guestEmail: patch.guestEmail ?? current.guestEmail,
          guests: patch.guests ?? current.guests,
          notes: patch.notes ?? current.notes,
        })
        .where(eq(orders.id, current.id))
        .returning()
    )[0]
    if (!updated) throw new Error('Could not update the order')
    return updated
  })
  return order
}

export type OrderDetail = {
  order: Order
  tableLabel: string | null
  tableSection: string | null
  waiterName: string
  items: Awaited<ReturnType<typeof loadItems>>
}

function loadItems(orderId: number) {
  return db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.roundNo), asc(orderItems.id))
}

export async function getOrderDetail(orderId: number): Promise<OrderDetail> {
  const row = (
    await db
      .select({
        order: orders,
        tableLabel: diningTables.label,
        tableSection: diningTables.section,
        waiterName: staff.name,
      })
      .from(orders)
      .leftJoin(diningTables, eq(orders.diningTableId, diningTables.id))
      .innerJoin(staff, eq(orders.waiterId, staff.id))
      .where(eq(orders.id, orderId))
      .limit(1)
  )[0]
  if (!row) throw ApiError.notFound('Order not found.')

  return {
    order: row.order,
    tableLabel: row.tableLabel,
    tableSection: row.tableSection,
    waiterName: row.waiterName,
    items: await loadItems(orderId),
  }
}

export async function getOrderByToken(token: string): Promise<OrderDetail> {
  const row = (
    await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.billToken, token))
      .limit(1)
  )[0]
  if (!row) throw ApiError.notFound('This bill link is not valid.')
  return getOrderDetail(row.id)
}

export type OrderStatusValue = Order['status']

export type OrderSummary = {
  id: number
  orderNo: number
  businessDate: string
  status: OrderStatusValue
  orderType: Order['orderType']
  diningTableId: number | null
  tableLabel: string | null
  tableSection: string | null
  waiterId: number
  waiterName: string
  guestName: string | null
  subtotalPaise: number
  totalPaise: number
  paymentMode: Order['paymentMode']
  itemCount: number
  openedAt: Date
  lastItemAt: Date | null
  settledAt: Date | null
}

export type ListOrdersFilter = {
  statuses?: readonly OrderStatusValue[]
  businessDate?: string
  waiterId?: number
}

export async function listOrders(filter: ListOrdersFilter = {}): Promise<OrderSummary[]> {
  const where = [
    filter.statuses?.length ? inArray(orders.status, [...filter.statuses]) : undefined,
    filter.businessDate ? eq(orders.businessDate, filter.businessDate) : undefined,
    filter.waiterId ? eq(orders.waiterId, filter.waiterId) : undefined,
  ].filter((clause) => clause !== undefined)

  const rows = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      businessDate: orders.businessDate,
      status: orders.status,
      orderType: orders.orderType,
      diningTableId: orders.diningTableId,
      tableLabel: diningTables.label,
      tableSection: diningTables.section,
      waiterId: orders.waiterId,
      waiterName: staff.name,
      guestName: orders.guestName,
      subtotalPaise: orders.subtotalPaise,
      totalPaise: orders.totalPaise,
      paymentMode: orders.paymentMode,
      openedAt: orders.openedAt,
      lastItemAt: orders.lastItemAt,
      settledAt: orders.settledAt,
      itemCount: sql<number>`(
        select coalesce(sum(oi.qty), 0) from order_items oi
        where oi.order_id = ${orders.id} and oi.status <> 'void'
      )`,
    })
    .from(orders)
    .leftJoin(diningTables, eq(orders.diningTableId, diningTables.id))
    .innerJoin(staff, eq(orders.waiterId, staff.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(orders.businessDate), desc(orders.orderNo))

  return rows.map((row) => ({ ...row, itemCount: Number(row.itemCount) }))
}

/** Owner's live board and the waiter's floor both read this. */
export async function listRunningOrders(waiterId?: number): Promise<OrderSummary[]> {
  const rows = await listOrders({ statuses: ['open', 'billed'], waiterId })
  // Longest since the last item first: that is the table waiting on someone.
  return rows.sort((a, b) => {
    const left = (a.lastItemAt ?? a.openedAt).getTime()
    const right = (b.lastItemAt ?? b.openedAt).getTime()
    return left - right
  })
}

export type KitchenLine = {
  id: number
  name: string
  variant: string | null
  qty: number
  note: string | null
  group: MenuGroup
  createdAt: Date
}

export type KitchenTicket = {
  orderId: number
  orderNo: number
  roundNo: number
  orderType: Order['orderType']
  tableLabel: string | null
  waiterName: string
  placedAt: Date
  lines: KitchenLine[]
}

/**
 * One ticket per order round, oldest first - the same thing the paper slip used
 * to be. Only lines still waiting to be served appear.
 */
export async function listKitchenTickets(group?: 'bar' | 'kitchen'): Promise<KitchenTicket[]> {
  const rows = await db
    .select({
      lineId: orderItems.id,
      name: orderItems.nameSnapshot,
      variant: orderItems.variantSnapshot,
      qty: orderItems.qty,
      note: orderItems.note,
      group: orderItems.groupSnapshot,
      createdAt: orderItems.createdAt,
      roundNo: orderItems.roundNo,
      orderId: orders.id,
      orderNo: orders.orderNo,
      orderType: orders.orderType,
      tableLabel: diningTables.label,
      waiterName: staff.name,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(staff, eq(orders.waiterId, staff.id))
    .leftJoin(diningTables, eq(orders.diningTableId, diningTables.id))
    .where(and(eq(orderItems.status, 'placed'), inArray(orders.status, ['open', 'billed'])))
    .orderBy(asc(orderItems.createdAt), asc(orderItems.id))

  const wanted = rows.filter((row) => {
    if (group === 'bar') return row.group === 'bar'
    if (group === 'kitchen') return row.group !== 'bar'
    return true
  })

  const tickets = new Map<string, KitchenTicket>()
  for (const row of wanted) {
    const key = `${row.orderId}-${row.roundNo}`
    let ticket = tickets.get(key)
    if (!ticket) {
      ticket = {
        orderId: row.orderId,
        orderNo: row.orderNo,
        roundNo: row.roundNo,
        orderType: row.orderType,
        tableLabel: row.tableLabel,
        waiterName: row.waiterName,
        placedAt: row.createdAt,
        lines: [],
      }
      tickets.set(key, ticket)
    }
    ticket.lines.push({
      id: row.lineId,
      name: row.name,
      variant: row.variant,
      qty: row.qty,
      note: row.note,
      group: row.group,
      createdAt: row.createdAt,
    })
  }

  return [...tickets.values()]
}

export async function findOrder(orderId: number): Promise<Order> {
  const row = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0]
  if (!row) throw ApiError.notFound('Order not found.')
  return row
}



