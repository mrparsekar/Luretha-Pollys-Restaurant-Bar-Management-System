import { and, asc, desc, eq, gte, lte, ne, sql } from 'drizzle-orm'

import { db } from '../db/index.js'
import { orderItems, orders, staff } from '../db/schema.js'
import { ApiError } from '../lib/http.js'
import { businessDate, isDateString } from '../lib/time.js'
import { getSettings } from './settings.js'

/**
 * Only settled orders count as sales. Open tabs are reported separately so the
 * owner can see what is still on the floor, and voids are counted but never
 * folded into revenue.
 */
export type Range = { from: string; to: string }

export async function resolveRange(from?: string, to?: string): Promise<Range> {
  const config = await getSettings()
  const today = businessDate(new Date(), config.businessDayStartHour)
  const start = from && isDateString(from) ? from : today
  const end = to && isDateString(to) ? to : start
  if (end < start) throw ApiError.badRequest('The end date is before the start date.')
  return { from: start, to: end }
}

function settledIn(range: Range) {
  return and(
    gte(orders.businessDate, range.from),
    lte(orders.businessDate, range.to),
    eq(orders.status, 'settled'),
  )
}

/** IST hour of the wall clock, independent of the server's timezone. */
const istHour = sql<number>`extract(hour from ((${orderItems.createdAt} + interval '330 minutes') at time zone 'UTC'))`

export type DaySheet = {
  range: Range
  orders: number
  covers: number
  itemsSold: number
  grossPaise: number
  discountPaise: number
  taxPaise: number
  serviceChargePaise: number
  roundOffPaise: number
  netPaise: number
  averageBillPaise: number
  cash: { orders: number; paise: number }
  upi: { orders: number; paise: number }
  foodPaise: number
  liquorPaise: number
  voids: { lines: number; paise: number }
  open: { orders: number; paise: number }
}

export async function daySheet(range: Range): Promise<DaySheet> {
  const totals = (
    await db
      .select({
        orders: sql<number>`count(*)`,
        covers: sql<number>`coalesce(sum(${orders.guests}), 0)`,
        gross: sql<number>`coalesce(sum(${orders.subtotalPaise}), 0)`,
        discount: sql<number>`coalesce(sum(${orders.discountPaise}), 0)`,
        tax: sql<number>`coalesce(sum(${orders.taxPaise}), 0)`,
        service: sql<number>`coalesce(sum(${orders.serviceChargePaise}), 0)`,
        roundOff: sql<number>`coalesce(sum(${orders.roundOffPaise}), 0)`,
        net: sql<number>`coalesce(sum(${orders.totalPaise}), 0)`,
        cashOrders: sql<number>`coalesce(sum(case when ${orders.paymentMode} = 'cash' then 1 else 0 end), 0)`,
        cashPaise: sql<number>`coalesce(sum(case when ${orders.paymentMode} = 'cash' then ${orders.totalPaise} else 0 end), 0)`,
        upiOrders: sql<number>`coalesce(sum(case when ${orders.paymentMode} = 'upi' then 1 else 0 end), 0)`,
        upiPaise: sql<number>`coalesce(sum(case when ${orders.paymentMode} = 'upi' then ${orders.totalPaise} else 0 end), 0)`,
      })
      .from(orders)
      .where(settledIn(range))
  )[0]

  const lines = (
    await db
      .select({
        itemsSold: sql<number>`coalesce(sum(${orderItems.qty}), 0)`,
        food: sql<number>`coalesce(sum(case when ${orderItems.groupSnapshot} <> 'bar' then ${orderItems.unitPricePaise} * ${orderItems.qty} else 0 end), 0)`,
        liquor: sql<number>`coalesce(sum(case when ${orderItems.groupSnapshot} = 'bar' then ${orderItems.unitPricePaise} * ${orderItems.qty} else 0 end), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(settledIn(range), ne(orderItems.status, 'void')))
  )[0]

  const voided = (
    await db
      .select({
        lines: sql<number>`count(*)`,
        paise: sql<number>`coalesce(sum(${orderItems.unitPricePaise} * ${orderItems.qty}), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          gte(orders.businessDate, range.from),
          lte(orders.businessDate, range.to),
          eq(orderItems.status, 'void'),
        ),
      )
  )[0]

  const running = (
    await db
      .select({
        orders: sql<number>`count(*)`,
        paise: sql<number>`coalesce(sum(${orders.totalPaise}), 0)`,
      })
      .from(orders)
      .where(
        and(
          gte(orders.businessDate, range.from),
          lte(orders.businessDate, range.to),
          sql`${orders.status} in ('open', 'billed')`,
        ),
      )
  )[0]

  const count = Number(totals?.orders ?? 0)
  const net = Number(totals?.net ?? 0)

  return {
    range,
    orders: count,
    covers: Number(totals?.covers ?? 0),
    itemsSold: Number(lines?.itemsSold ?? 0),
    grossPaise: Number(totals?.gross ?? 0),
    discountPaise: Number(totals?.discount ?? 0),
    taxPaise: Number(totals?.tax ?? 0),
    serviceChargePaise: Number(totals?.service ?? 0),
    roundOffPaise: Number(totals?.roundOff ?? 0),
    netPaise: net,
    averageBillPaise: count > 0 ? Math.round(net / count) : 0,
    cash: { orders: Number(totals?.cashOrders ?? 0), paise: Number(totals?.cashPaise ?? 0) },
    upi: { orders: Number(totals?.upiOrders ?? 0), paise: Number(totals?.upiPaise ?? 0) },
    foodPaise: Number(lines?.food ?? 0),
    liquorPaise: Number(lines?.liquor ?? 0),
    voids: { lines: Number(voided?.lines ?? 0), paise: Number(voided?.paise ?? 0) },
    open: { orders: Number(running?.orders ?? 0), paise: Number(running?.paise ?? 0) },
  }
}

export type DailyRow = {
  businessDate: string
  orders: number
  covers: number
  netPaise: number
  cashPaise: number
  upiPaise: number
}

export async function dailyBreakdown(range: Range): Promise<DailyRow[]> {
  const rows = await db
    .select({
      businessDate: orders.businessDate,
      orders: sql<number>`count(*)`,
      covers: sql<number>`coalesce(sum(${orders.guests}), 0)`,
      netPaise: sql<number>`coalesce(sum(${orders.totalPaise}), 0)`,
      cashPaise: sql<number>`coalesce(sum(case when ${orders.paymentMode} = 'cash' then ${orders.totalPaise} else 0 end), 0)`,
      upiPaise: sql<number>`coalesce(sum(case when ${orders.paymentMode} = 'upi' then ${orders.totalPaise} else 0 end), 0)`,
    })
    .from(orders)
    .where(settledIn(range))
    .groupBy(orders.businessDate)
    .orderBy(asc(orders.businessDate))

  return rows.map((row) => ({
    businessDate: row.businessDate,
    orders: Number(row.orders),
    covers: Number(row.covers),
    netPaise: Number(row.netPaise),
    cashPaise: Number(row.cashPaise),
    upiPaise: Number(row.upiPaise),
  }))
}

export type ItemRow = {
  name: string
  variant: string | null
  category: string
  group: string
  qty: number
  amountPaise: number
}

export async function itemWise(range: Range, limit = 500): Promise<ItemRow[]> {
  const rows = await db
    .select({
      name: orderItems.nameSnapshot,
      variant: orderItems.variantSnapshot,
      category: orderItems.categorySnapshot,
      group: orderItems.groupSnapshot,
      qty: sql<number>`sum(${orderItems.qty})`,
      amountPaise: sql<number>`sum(${orderItems.unitPricePaise} * ${orderItems.qty})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(settledIn(range), ne(orderItems.status, 'void')))
    .groupBy(
      orderItems.nameSnapshot,
      orderItems.variantSnapshot,
      orderItems.categorySnapshot,
      orderItems.groupSnapshot,
    )
    .orderBy(desc(sql`sum(${orderItems.unitPricePaise} * ${orderItems.qty})`))
    .limit(limit)

  return rows.map((row) => ({
    name: row.name,
    variant: row.variant,
    category: row.category,
    group: row.group,
    qty: Number(row.qty),
    amountPaise: Number(row.amountPaise),
  }))
}

export type CategoryRow = { category: string; group: string; qty: number; amountPaise: number }

export async function categoryWise(range: Range): Promise<CategoryRow[]> {
  const rows = await db
    .select({
      category: orderItems.categorySnapshot,
      group: orderItems.groupSnapshot,
      qty: sql<number>`sum(${orderItems.qty})`,
      amountPaise: sql<number>`sum(${orderItems.unitPricePaise} * ${orderItems.qty})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(settledIn(range), ne(orderItems.status, 'void')))
    .groupBy(orderItems.categorySnapshot, orderItems.groupSnapshot)
    .orderBy(desc(sql`sum(${orderItems.unitPricePaise} * ${orderItems.qty})`))

  return rows.map((row) => ({
    category: row.category,
    group: row.group,
    qty: Number(row.qty),
    amountPaise: Number(row.amountPaise),
  }))
}

export type WaiterRow = {
  waiterId: number
  name: string
  orders: number
  covers: number
  netPaise: number
  averageBillPaise: number
}

export async function waiterWise(range: Range): Promise<WaiterRow[]> {
  const rows = await db
    .select({
      waiterId: orders.waiterId,
      name: staff.name,
      orders: sql<number>`count(*)`,
      covers: sql<number>`coalesce(sum(${orders.guests}), 0)`,
      netPaise: sql<number>`coalesce(sum(${orders.totalPaise}), 0)`,
    })
    .from(orders)
    .innerJoin(staff, eq(orders.waiterId, staff.id))
    .where(settledIn(range))
    .groupBy(orders.waiterId, staff.name)
    .orderBy(desc(sql`coalesce(sum(${orders.totalPaise}), 0)`))

  return rows.map((row) => {
    const count = Number(row.orders)
    const net = Number(row.netPaise)
    return {
      waiterId: row.waiterId,
      name: row.name,
      orders: count,
      covers: Number(row.covers),
      netPaise: net,
      averageBillPaise: count > 0 ? Math.round(net / count) : 0,
    }
  })
}

export type HourRow = { hour: number; label: string; qty: number; amountPaise: number }

/** Which hours actually earn: drives staffing and the kitchen's prep window. */
export async function hourly(range: Range): Promise<HourRow[]> {
  const rows = await db
    .select({
      hour: istHour,
      qty: sql<number>`sum(${orderItems.qty})`,
      amountPaise: sql<number>`sum(${orderItems.unitPricePaise} * ${orderItems.qty})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(settledIn(range), ne(orderItems.status, 'void')))
    .groupBy(istHour)

  const byHour = new Map<number, { qty: number; amountPaise: number }>()
  for (const row of rows) {
    byHour.set(Number(row.hour), {
      qty: Number(row.qty),
      amountPaise: Number(row.amountPaise),
    })
  }

  const out: HourRow[] = []
  for (let hour = 0; hour < 24; hour += 1) {
    const found = byHour.get(hour)
    if (!found && (hour < 7 || hour > 23)) continue
    const suffix = hour >= 12 ? 'PM' : 'AM'
    const h12 = hour % 12 === 0 ? 12 : hour % 12
    out.push({
      hour,
      label: `${h12} ${suffix}`,
      qty: found?.qty ?? 0,
      amountPaise: found?.amountPaise ?? 0,
    })
  }
  return out
}

export type SettledOrderRow = {
  id: number
  orderNo: number
  businessDate: string
  table: string | null
  waiter: string
  guests: number
  subtotalPaise: number
  discountPaise: number
  taxPaise: number
  totalPaise: number
  paymentMode: string | null
  settledAt: Date | null
}

/** The row-level export the owner reconciles cash against at close. */
export async function settledOrders(range: Range): Promise<SettledOrderRow[]> {
  const rows = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      businessDate: orders.businessDate,
      table: sql<string | null>`(select label from dining_tables dt where dt.id = ${orders.diningTableId})`,
      waiter: staff.name,
      guests: orders.guests,
      subtotalPaise: orders.subtotalPaise,
      discountPaise: orders.discountPaise,
      taxPaise: orders.taxPaise,
      totalPaise: orders.totalPaise,
      paymentMode: orders.paymentMode,
      settledAt: orders.settledAt,
    })
    .from(orders)
    .innerJoin(staff, eq(orders.waiterId, staff.id))
    .where(settledIn(range))
    .orderBy(asc(orders.businessDate), asc(orders.orderNo))

  return rows
}

