import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

import { db } from '../db/index.js'
import {
  categories,
  itemVariants,
  menuItems,
  orderItems,
  orders,
  type Category,
  type ItemVariant,
  type MenuGroup,
  type MenuItem,
} from '../db/schema.js'
import { recordAudit } from '../lib/audit.js'
import { ApiError } from '../lib/http.js'
import { MAX_ITEM_PRICE_PAISE } from '../lib/money.js'
import type { SessionPayload } from '../lib/session.js'
import { formatClock, isWithinWindow } from '../lib/time.js'
import { getSettings, updateSettings } from './settings.js'
import { specialMenuItemIds } from './specials.js'

export type MenuVariantView = {
  id: number
  label: string
  pricePaise: number | null
  /** Printed without a price: the waiter is asked for it at order time. */
  needsPrice: boolean
}

export type MenuItemView = {
  id: number
  categoryId: number
  name: string
  description: string | null
  priceMode: MenuItem['priceMode']
  basePricePaise: number | null
  isVeg: boolean | null
  available: boolean
  /** False when outside its serving window right now (7pm-10pm steaks). */
  servingNow: boolean
  windowLabel: string | null
  needsPrice: boolean
  note: string | null
  sort: number
  variants: MenuVariantView[]
}

export type MenuCategoryView = {
  id: number
  name: string
  group: MenuGroup
  note: string | null
  sort: number
  items: MenuItemView[]
  /** True for the two auto-populated "most ordered" tabs, which are not real DB categories. */
  pinned?: boolean
}

/** Sentinel ids for the computed tabs: negative, so they never collide with a real category id. */
export const PINNED_FOOD_CATEGORY_ID = -1
export const PINNED_DRINKS_CATEGORY_ID = -2
export const PINNED_SPECIAL_CATEGORY_ID = -3

const FOOD_GROUPS: readonly MenuGroup[] = ['breakfast', 'food', 'dessert']
const DRINK_GROUPS: readonly MenuGroup[] = ['bar', 'beverage']

function sectionToken(category: MenuCategoryView): string {
  if (category.id === PINNED_SPECIAL_CATEGORY_ID) return 'pinned:special'
  if (category.id === PINNED_FOOD_CATEGORY_ID) return 'pinned:food'
  if (category.id === PINNED_DRINKS_CATEGORY_ID) return 'pinned:drinks'
  return `cat:${category.id}`
}

/**
 * Applies the owner's saved tab order. `null` means the default: both pinned tabs
 * (when they have items) first, then real categories in their own sort order - the
 * order `sections` already arrives in. A saved order only shows a pinned tab when
 * its token is present, so removing it from the list hides it; a real category that
 * is missing from an old saved order (added since) is appended at the end.
 */
function applySectionOrder(sections: MenuCategoryView[], order: string[] | null): MenuCategoryView[] {
  if (!order) return sections

  const byToken = new Map(sections.map((section) => [sectionToken(section), section]))
  const ordered: MenuCategoryView[] = []
  for (const token of order) {
    const section = byToken.get(token)
    if (section) {
      ordered.push(section)
      byToken.delete(token)
    }
  }
  for (const section of byToken.values()) {
    if (!section.pinned) ordered.push(section)
  }
  return ordered
}

function windowLabel(item: MenuItem): string | null {
  if (!item.availFrom && !item.availTo) return null
  const from = formatClock(item.availFrom)
  const to = formatClock(item.availTo)
  if (from && to) return `${from} - ${to}`
  if (from) return `From ${from}`
  return `Until ${to}`
}

async function loadCategories(at: Date): Promise<MenuCategoryView[]> {
  const [categoryRows, itemRows, variantRows] = await Promise.all([
    db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sort), asc(categories.name)),
    db.select().from(menuItems).orderBy(asc(menuItems.sort), asc(menuItems.name)),
    db.select().from(itemVariants).orderBy(asc(itemVariants.sort), asc(itemVariants.id)),
  ])

  const variantsByItem = new Map<number, MenuVariantView[]>()
  for (const variant of variantRows) {
    const list = variantsByItem.get(variant.itemId) ?? []
    list.push({
      id: variant.id,
      label: variant.label,
      pricePaise: variant.pricePaise,
      needsPrice: variant.pricePaise == null,
    })
    variantsByItem.set(variant.itemId, list)
  }

  const itemsByCategory = new Map<number, MenuItemView[]>()
  for (const item of itemRows) {
    const variants = variantsByItem.get(item.id) ?? []
    const needsPrice =
      item.priceMode === 'ask' || (item.priceMode === 'fixed' && item.basePricePaise == null)
    const list = itemsByCategory.get(item.categoryId) ?? []
    list.push({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      priceMode: item.priceMode,
      basePricePaise: item.basePricePaise,
      isVeg: item.isVeg,
      available: item.available,
      servingNow: isWithinWindow(item.availFrom, item.availTo, at),
      windowLabel: windowLabel(item),
      needsPrice,
      note: item.note,
      sort: item.sort,
      variants,
    })
    itemsByCategory.set(item.categoryId, list)
  }

  return categoryRows.map((category) => ({
    id: category.id,
    name: category.name,
    group: category.group,
    note: category.note,
    sort: category.sort,
    items: itemsByCategory.get(category.id) ?? [],
  }))
}

/**
 * The ids of the items most ordered from bills that actually went through (billed
 * or settled - an open or voided order says nothing about what sells), restricted
 * to items still available on an active section so the tab is always orderable.
 */
async function popularItemIds(bucket: 'food' | 'drinks', limit = 12): Promise<number[]> {
  const groups = bucket === 'food' ? FOOD_GROUPS : DRINK_GROUPS
  const qty = sql<number>`sum(${orderItems.qty})`

  const rows = await db
    .select({ menuItemId: orderItems.menuItemId, qty })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
    .innerJoin(categories, eq(menuItems.categoryId, categories.id))
    .where(
      and(
        inArray(orders.status, ['billed', 'settled']),
        sql`${orderItems.status} <> 'void'`,
        inArray(categories.group, groups),
        eq(menuItems.available, true),
        eq(categories.isActive, true),
      ),
    )
    .groupBy(orderItems.menuItemId)
    .orderBy(desc(qty))
    .limit(limit)

  return rows.map((row) => row.menuItemId).filter((id): id is number => id !== null)
}

/** The whole card in one request: the waiter phone caches it and searches locally. */
export async function getMenu(at: Date = new Date()): Promise<MenuCategoryView[]> {
  const [base, config, specialIds, foodIds, drinkIds] = await Promise.all([
    loadCategories(at),
    getSettings(),
    specialMenuItemIds(),
    popularItemIds('food'),
    popularItemIds('drinks'),
  ])

  const itemById = new Map(base.flatMap((category) => category.items.map((item) => [item.id, item])))
  const resolve = (ids: number[]): MenuItemView[] =>
    ids.map((id) => itemById.get(id)).filter((item): item is MenuItemView => item !== undefined)

  const pinned: MenuCategoryView[] = []
  const specialItems = resolve(specialIds)
  const foodItems = resolve(foodIds)
  const drinkItems = resolve(drinkIds)
  // Ahead of Most Ordered: the owner picked these on purpose, today.
  if (specialItems.length > 0) {
    pinned.push({
      id: PINNED_SPECIAL_CATEGORY_ID,
      name: "Today's Special",
      group: 'food',
      note: null,
      sort: -3,
      pinned: true,
      items: specialItems,
    })
  }
  if (foodItems.length > 0) {
    pinned.push({
      id: PINNED_FOOD_CATEGORY_ID,
      name: 'Most Ordered Food',
      group: 'food',
      note: null,
      sort: -2,
      pinned: true,
      items: foodItems,
    })
  }
  if (drinkItems.length > 0) {
    pinned.push({
      id: PINNED_DRINKS_CATEGORY_ID,
      name: 'Most Ordered Drinks',
      group: 'beverage',
      note: null,
      sort: -1,
      pinned: true,
      items: drinkItems,
    })
  }

  return applySectionOrder([...pinned, ...base], config.sectionOrder)
}

/** Every live category id plus the two pinned keys, for validating a saved tab order. */
async function knownSectionTokens(): Promise<Set<string>> {
  const rows = await db.select({ id: categories.id }).from(categories)
  return new Set(['pinned:special', 'pinned:food', 'pinned:drinks', ...rows.map((row) => `cat:${row.id}`)])
}

/** Owner's drag-to-reorder of the whole tab strip, pinned tabs included. */
export async function updateSectionOrder(order: readonly string[]): Promise<void> {
  const known = await knownSectionTokens()
  const unknown = order.find((token) => !known.has(token))
  if (unknown) throw ApiError.badRequest(`"${unknown}" is not a menu section.`)

  await updateSettings({ sectionOrder: [...order] })
}

function assertPrice(value: number | null | undefined, what: string): void {
  if (value == null) return
  if (!Number.isInteger(value) || value < 0 || value > MAX_ITEM_PRICE_PAISE) {
    throw ApiError.badRequest(`That ${what} looks wrong.`)
  }
}

export type ItemPatch = Partial<{
  categoryId: number
  name: string
  description: string | null
  priceMode: MenuItem['priceMode']
  basePricePaise: number | null
  isVeg: boolean | null
  available: boolean
  availFrom: string | null
  availTo: string | null
  note: string | null
  sort: number
}>

async function findItem(id: number): Promise<MenuItem> {
  const row = (await db.select().from(menuItems).where(eq(menuItems.id, id)).limit(1))[0]
  if (!row) throw ApiError.notFound('That item is not on the menu.')
  return row
}

/** Every price move is audited: the owner needs to see who changed what. */
export async function updateItem(
  id: number,
  patch: ItemPatch,
  session: SessionPayload,
): Promise<MenuItem> {
  assertPrice(patch.basePricePaise, 'price')
  const before = await findItem(id)

  if (patch.categoryId && patch.categoryId !== before.categoryId) {
    const exists = (
      await db.select({ id: categories.id }).from(categories).where(eq(categories.id, patch.categoryId)).limit(1)
    )[0]
    if (!exists) throw ApiError.badRequest('That section does not exist.')
  }

  const updated = (await db.update(menuItems).set(patch).where(eq(menuItems.id, id)).returning())[0]
  if (!updated) throw new Error('Could not update the item')

  const priceChanged = 'basePricePaise' in patch && patch.basePricePaise !== before.basePricePaise
  const availabilityChanged = 'available' in patch && patch.available !== before.available
  if (priceChanged || availabilityChanged) {
    await recordAudit({
      actorId: session.sub,
      action: priceChanged ? 'menu_item.price' : 'menu_item.availability',
      entity: 'menu_item',
      entityId: id,
      before: { name: before.name, basePricePaise: before.basePricePaise, available: before.available },
      after: { name: updated.name, basePricePaise: updated.basePricePaise, available: updated.available },
    })
  }

  return updated
}

export type NewItem = ItemPatch & { categoryId: number; name: string }

export async function createItem(input: NewItem, session: SessionPayload): Promise<MenuItem> {
  assertPrice(input.basePricePaise, 'price')
  const created = (
    await db
      .insert(menuItems)
      .values({ ...input, categoryId: input.categoryId, name: input.name })
      .returning()
  )[0]
  if (!created) throw new Error('Could not add the item')

  await recordAudit({
    actorId: session.sub,
    action: 'menu_item.create',
    entity: 'menu_item',
    entityId: created.id,
    after: { name: created.name, basePricePaise: created.basePricePaise, priceMode: created.priceMode },
  })
  return created
}

/**
 * A real delete is safe: order_items keeps its own name and price snapshot and
 * only drops the foreign key, so past bills and reports are untouched.
 */
export async function deleteItem(id: number, session: SessionPayload): Promise<void> {
  const before = await findItem(id)
  await db.delete(menuItems).where(eq(menuItems.id, id))
  await recordAudit({
    actorId: session.sub,
    action: 'menu_item.delete',
    entity: 'menu_item',
    entityId: id,
    before: { name: before.name, basePricePaise: before.basePricePaise },
  })
}

export type VariantPatch = Partial<{ label: string; pricePaise: number | null; sort: number }>

export async function addVariant(
  itemId: number,
  input: { label: string; pricePaise: number | null; sort?: number },
  session: SessionPayload,
): Promise<ItemVariant> {
  assertPrice(input.pricePaise, 'price')
  const item = await findItem(itemId)

  const created = (
    await db
      .insert(itemVariants)
      .values({ itemId: item.id, label: input.label, pricePaise: input.pricePaise, sort: input.sort ?? 0 })
      .returning()
  )[0]
  if (!created) throw new Error('Could not add the size')

  // An item with sizes must price through them, never through a base price.
  if (item.priceMode !== 'variant') {
    await db
      .update(menuItems)
      .set({ priceMode: 'variant', basePricePaise: null })
      .where(eq(menuItems.id, item.id))
  }

  await recordAudit({
    actorId: session.sub,
    action: 'item_variant.create',
    entity: 'item_variant',
    entityId: created.id,
    after: { item: item.name, label: created.label, pricePaise: created.pricePaise },
  })
  return created
}

export async function updateVariant(
  id: number,
  patch: VariantPatch,
  session: SessionPayload,
): Promise<ItemVariant> {
  assertPrice(patch.pricePaise, 'price')
  const before = (await db.select().from(itemVariants).where(eq(itemVariants.id, id)).limit(1))[0]
  if (!before) throw ApiError.notFound('That size is not on the menu.')

  const updated = (
    await db.update(itemVariants).set(patch).where(eq(itemVariants.id, id)).returning()
  )[0]
  if (!updated) throw new Error('Could not update the size')

  if ('pricePaise' in patch && patch.pricePaise !== before.pricePaise) {
    await recordAudit({
      actorId: session.sub,
      action: 'item_variant.price',
      entity: 'item_variant',
      entityId: id,
      before: { label: before.label, pricePaise: before.pricePaise },
      after: { label: updated.label, pricePaise: updated.pricePaise },
    })
  }
  return updated
}

export async function deleteVariant(id: number, session: SessionPayload): Promise<void> {
  const before = (await db.select().from(itemVariants).where(eq(itemVariants.id, id)).limit(1))[0]
  if (!before) throw ApiError.notFound('That size is not on the menu.')
  await db.delete(itemVariants).where(eq(itemVariants.id, id))
  await recordAudit({
    actorId: session.sub,
    action: 'item_variant.delete',
    entity: 'item_variant',
    entityId: id,
    before: { label: before.label, pricePaise: before.pricePaise },
  })
}

export type CategoryPatch = Partial<{
  name: string
  group: MenuGroup
  note: string | null
  sort: number
  isActive: boolean
}>

export async function listCategories(): Promise<Category[]> {
  return db.select().from(categories).orderBy(asc(categories.sort), asc(categories.name))
}

export async function createCategory(input: { name: string; group: MenuGroup; note?: string | null; sort?: number }): Promise<Category> {
  const created = (
    await db
      .insert(categories)
      .values({ name: input.name, group: input.group, note: input.note ?? null, sort: input.sort ?? 0 })
      .returning()
  )[0]
  if (!created) throw new Error('Could not add the section')
  return created
}

export async function updateCategory(id: number, patch: CategoryPatch): Promise<Category> {
  const updated = (await db.update(categories).set(patch).where(eq(categories.id, id)).returning())[0]
  if (!updated) throw ApiError.notFound('That section does not exist.')
  return updated
}

/** Bulk drag-and-drop reorder from the menu manager. */
export async function reorderItems(pairs: readonly { id: number; sort: number }[]): Promise<void> {
  if (pairs.length === 0) return
  const ids = pairs.map((p) => p.id)
  const existing = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(inArray(menuItems.id, ids))
  const known = new Set(existing.map((row) => row.id))

  await db.transaction(async (tx) => {
    for (const pair of pairs) {
      if (!known.has(pair.id)) continue
      await tx.update(menuItems).set({ sort: pair.sort }).where(eq(menuItems.id, pair.id))
    }
  })
}

/** Owner's price sign-off sheet: every priced row, grouped as the printed card is. */
export type VerificationRow = { name: string; detail: string | null; price: string }

export async function priceVerificationSheet(): Promise<
  { category: string; group: MenuGroup; rows: VerificationRow[] }[]
> {
  const menu = await getMenu()
  return menu
    .filter((category) => category.items.length > 0)
    .map((category) => ({
      category: category.name,
      group: category.group,
      rows: category.items.flatMap<VerificationRow>((item) => {
        if (item.variants.length > 0) {
          return item.variants.map((variant) => ({
            name: item.name,
            detail: variant.label,
            price: variant.pricePaise == null ? 'ask' : String(variant.pricePaise / 100),
          }))
        }
        return [
          {
            name: item.name,
            detail: null,
            price:
              item.priceMode === 'ask' || item.basePricePaise == null
                ? 'ask'
                : String(item.basePricePaise / 100),
          },
        ]
      }),
    }))
}

