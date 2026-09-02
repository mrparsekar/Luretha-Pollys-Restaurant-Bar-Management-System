import { and, asc, eq, inArray } from 'drizzle-orm'

import { db } from '../db'
import { diningTables, orders, staff, type DiningTable } from '../db/schema'
import { ApiError } from '../lib/http'
import { listRunningOrders, type OrderSummary } from './orders'

export type FloorTable = {
  id: number
  label: string
  section: DiningTable['section']
  seats: number
  sort: number
  /**
   * Summary only - who has it and how much is on it. The itemised tab stays
   * behind the per-order access check, so one waiter cannot read another's order.
   */
  order: OrderSummary | null
}

export async function getFloor(): Promise<FloorTable[]> {
  const [tables, running] = await Promise.all([
    db
      .select()
      .from(diningTables)
      .where(eq(diningTables.isActive, true))
      .orderBy(asc(diningTables.sort), asc(diningTables.label)),
    listRunningOrders(),
  ])

  const byTable = new Map<number, OrderSummary>()
  for (const order of running) {
    if (order.diningTableId != null && !byTable.has(order.diningTableId)) {
      byTable.set(order.diningTableId, order)
    }
  }

  return tables.map((table) => ({
    id: table.id,
    label: table.label,
    section: table.section,
    seats: table.seats,
    sort: table.sort,
    order: byTable.get(table.id) ?? null,
  }))
}

export async function listTables(includeInactive = false): Promise<DiningTable[]> {
  const rows = await db
    .select()
    .from(diningTables)
    .where(includeInactive ? undefined : eq(diningTables.isActive, true))
    .orderBy(asc(diningTables.sort), asc(diningTables.label))
  return rows
}

export type TableInput = {
  label: string
  section?: DiningTable['section']
  seats?: number
  sort?: number
}

export async function createTable(input: TableInput): Promise<DiningTable> {
  const existing = (
    await db.select({ id: diningTables.id }).from(diningTables).where(eq(diningTables.label, input.label)).limit(1)
  )[0]
  if (existing) throw ApiError.conflict('A table with that name already exists.')

  const created = (
    await db
      .insert(diningTables)
      .values({
        label: input.label,
        section: input.section ?? 'indoor',
        seats: input.seats ?? 4,
        sort: input.sort ?? 0,
      })
      .returning()
  )[0]
  if (!created) throw new Error('Could not add the table')
  return created
}

export async function updateTable(
  id: number,
  patch: Partial<TableInput & { isActive: boolean }>,
): Promise<DiningTable> {
  if (patch.isActive === false) {
    const busy = (
      await db
        .select({ orderNo: orders.orderNo })
        .from(orders)
        .where(and(eq(orders.diningTableId, id), inArray(orders.status, ['open', 'billed'])))
        .limit(1)
    )[0]
    if (busy) throw ApiError.conflict(`Order #${busy.orderNo} is still running on this table.`)
  }

  const updated = (
    await db.update(diningTables).set(patch).where(eq(diningTables.id, id)).returning()
  )[0]
  if (!updated) throw ApiError.notFound('That table does not exist.')
  return updated
}

/** Who is on shift, for the owner's board filters. */
export async function listWaiters(): Promise<{ id: number; name: string }[]> {
  return db
    .select({ id: staff.id, name: staff.name })
    .from(staff)
    .where(and(eq(staff.isActive, true), eq(staff.role, 'waiter')))
    .orderBy(asc(staff.name))
}
