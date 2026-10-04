import { asc, eq } from 'drizzle-orm'

import { db } from '../db/index.js'
import { dailySpecials, menuItems } from '../db/schema.js'
import { ApiError } from '../lib/http.js'

export type SpecialView = {
  id: number
  source: 'menu_item' | 'custom'
  name: string
  description: string | null
  pricePaise: number | null
  isVeg: boolean | null
}

/**
 * The owner's curated list, oldest first. A menu-item-sourced row whose item has
 * since been 86'd is left out - it would otherwise promise something the kitchen
 * cannot serve - but the row itself stays, so it quietly comes back if the item does.
 */
export async function listSpecials(): Promise<SpecialView[]> {
  const rows = await db
    .select({ special: dailySpecials, item: menuItems })
    .from(dailySpecials)
    .leftJoin(menuItems, eq(dailySpecials.menuItemId, menuItems.id))
    .orderBy(asc(dailySpecials.id))

  const views: SpecialView[] = []
  for (const { special, item } of rows) {
    if (special.source === 'menu_item') {
      if (!item || !item.available) continue
      views.push({
        id: special.id,
        source: 'menu_item',
        name: item.name,
        description: item.description,
        pricePaise: item.priceMode === 'fixed' ? item.basePricePaise : null,
        isVeg: item.isVeg,
      })
    } else {
      views.push({
        id: special.id,
        source: 'custom',
        name: special.customName ?? '',
        description: special.customDescription,
        pricePaise: special.customPricePaise,
        isVeg: null,
      })
    }
  }
  return views
}

/** The ids behind still-available menu-item specials, for the pinned ordering tab. */
export async function specialMenuItemIds(): Promise<number[]> {
  const rows = await db
    .select({ menuItemId: dailySpecials.menuItemId, available: menuItems.available })
    .from(dailySpecials)
    .innerJoin(menuItems, eq(dailySpecials.menuItemId, menuItems.id))
    .where(eq(dailySpecials.source, 'menu_item'))
    .orderBy(asc(dailySpecials.id))

  return rows.filter((row) => row.available).map((row) => row.menuItemId as number)
}

export async function addMenuItemSpecial(menuItemId: number): Promise<void> {
  const item = (await db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.id, menuItemId)).limit(1))[0]
  if (!item) throw ApiError.notFound('That item is not on the menu.')

  const existing = (
    await db.select({ id: dailySpecials.id }).from(dailySpecials).where(eq(dailySpecials.menuItemId, menuItemId)).limit(1)
  )[0]
  if (existing) throw ApiError.conflict('That item is already a special.')

  await db.insert(dailySpecials).values({ source: 'menu_item', menuItemId })
}

export async function addCustomSpecial(input: {
  name: string
  description?: string | null
  pricePaise?: number | null
}): Promise<void> {
  await db.insert(dailySpecials).values({
    source: 'custom',
    customName: input.name,
    customDescription: input.description ?? null,
    customPricePaise: input.pricePaise ?? null,
  })
}

export async function removeSpecial(id: number): Promise<void> {
  const deleted = await db.delete(dailySpecials).where(eq(dailySpecials.id, id)).returning({ id: dailySpecials.id })
  if (deleted.length === 0) throw ApiError.notFound('That special is already gone.')
}
