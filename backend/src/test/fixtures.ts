import { migrate } from 'drizzle-orm/pglite/migrator'

import { db, isEmbedded } from '../db/index.js'
import { categories, itemVariants, menuItems, staff, diningTables } from '../db/schema.js'
import { hashSecret } from '../lib/password.js'
import type { SessionPayload } from '../lib/session.js'

/**
 * A tiny stand-in menu. The real 359-item seed is not needed to prove the ordering
 * and billing rules, and a handful of rows keeps every assertion readable: one
 * fixed-price dish, one spirit with two pour sizes, one ask-for-price catch, one
 * item gated to the evening, and one that has been 86'd.
 */
export type Fixtures = {
  owner: SessionPayload
  waiter: SessionPayload
  otherWaiter: SessionPayload
  tableId: number
  secondTableId: number
  dish: number
  spirit: { id: number; small: number; large: number }
  askPrice: number
  gated: number
  unavailable: number
}

const session = (sub: number, role: 'owner' | 'waiter', name: string): SessionPayload => ({
  sub,
  role,
  name,
  iat: 0,
  exp: 4_000_000_000,
})

export const DISH_PAISE = 18_000 // Rs 180 Chicken Cafreal
export const SMALL_POUR_PAISE = 7_000 // Rs 70 for 30ml
export const LARGE_POUR_PAISE = 13_000 // Rs 130 for 60ml

let cached: Fixtures | null = null

export async function setupTestDb(): Promise<Fixtures> {
  if (cached) return cached

  // A test that pointed at the client's real database would be a disaster, so this
  // refuses to run unless src/db fell back to the embedded copy.
  if (!isEmbedded()) {
    throw new Error('Tests must run on embedded PGlite. DATABASE_URL should be empty.')
  }

  await migrate(db as never, { migrationsFolder: './db/migrations' })

  const pin = await hashSecret('4731')
  const password = await hashSecret('owner-password')

  const [ownerRow, waiterRow, otherRow] = await db
    .insert(staff)
    .values([
      { name: 'Test Owner', role: 'owner', email: 'owner@test.local', passwordHash: password },
      { name: 'Test Waiter', role: 'waiter', pinHash: pin },
      { name: 'Other Waiter', role: 'waiter', pinHash: pin },
    ])
    .returning()

  const [tableOne, tableTwo] = await db
    .insert(diningTables)
    .values([
      { label: 'Test 1', section: 'beach', seats: 4, sort: 1 },
      { label: 'Test 2', section: 'garden', seats: 2, sort: 2 },
    ])
    .returning()

  const [kitchen, bar] = await db
    .insert(categories)
    .values([
      { name: 'Test Kitchen', group: 'food', sort: 1 },
      { name: 'Test Bar', group: 'bar', sort: 2 },
    ])
    .returning()

  const [dish, spirit, askPrice, gated, unavailable] = await db
    .insert(menuItems)
    .values([
      {
        categoryId: kitchen!.id,
        name: 'Test Cafreal',
        priceMode: 'fixed',
        basePricePaise: DISH_PAISE,
        isVeg: false,
      },
      { categoryId: bar!.id, name: 'Test Rum', priceMode: 'variant' },
      { categoryId: kitchen!.id, name: 'Test Prawns', priceMode: 'ask' },
      {
        categoryId: kitchen!.id,
        name: 'Test Beef Steak',
        priceMode: 'fixed',
        basePricePaise: 42_000,
        availFrom: '19:00:00',
        availTo: '22:00:00',
      },
      {
        categoryId: kitchen!.id,
        name: 'Test Sold Out',
        priceMode: 'fixed',
        basePricePaise: 10_000,
        available: false,
      },
    ])
    .returning()

  const [small, large] = await db
    .insert(itemVariants)
    .values([
      { itemId: spirit!.id, label: '30ml', pricePaise: SMALL_POUR_PAISE, sort: 1 },
      { itemId: spirit!.id, label: '60ml', pricePaise: LARGE_POUR_PAISE, sort: 2 },
    ])
    .returning()

  cached = {
    owner: session(ownerRow!.id, 'owner', ownerRow!.name),
    waiter: session(waiterRow!.id, 'waiter', waiterRow!.name),
    otherWaiter: session(otherRow!.id, 'waiter', otherRow!.name),
    tableId: tableOne!.id,
    secondTableId: tableTwo!.id,
    dish: dish!.id,
    spirit: { id: spirit!.id, small: small!.id, large: large!.id },
    askPrice: askPrice!.id,
    gated: gated!.id,
    unavailable: unavailable!.id,
  }
  return cached
}

/** Narrows a thrown ApiError to the bits a test cares about. */
export async function caught(
  run: () => Promise<unknown>,
): Promise<{ status: number; message: string }> {
  try {
    await run()
  } catch (error) {
    const e = error as { status?: number; message?: string }
    return { status: e.status ?? 500, message: e.message ?? '' }
  }
  throw new Error('Expected the call to fail, but it succeeded.')
}
