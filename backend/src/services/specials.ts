import { and, asc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm'

import { db } from '../db/index.js'
import { categories, dailySpecials, menuItems } from '../db/schema.js'
import { ApiError } from '../lib/http.js'
import { businessDate } from '../lib/time.js'
import { getSettings } from './settings.js'

/** The one reserved category a custom-typed special's auto-created item lives under. */
const SPECIALS_CATEGORY_NAME = 'Specials'

export type SpecialView = {
  id: number
  menuItemId: number
  /** "custom" just means its item lives under the reserved Specials category - a display hint, not a different data shape. */
  source: 'menu_item' | 'custom'
  name: string
  description: string | null
  pricePaise: number | null
  isVeg: boolean | null
  /** Set for a one-off; null once it has been turned into a weekly repeat. */
  onDate: string | null
  /** 0=Sun..6=Sat. Only meaningful when onDate is null. Null/empty means every day. */
  daysOfWeek: number[] | null
}

type Row = { special: typeof dailySpecials.$inferSelect; item: typeof menuItems.$inferSelect; categoryName: string }

/** "Today" as the business already understands it - the same boundary orders use. */
async function todayBusinessDate(at: Date = new Date()): Promise<string> {
  const settings = await getSettings()
  return businessDate(at, settings.businessDayStartHour)
}

/** 0=Sun..6=Sat for a 'YYYY-MM-DD' date, computed without any timezone ambiguity. */
function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
}

function scheduledOn(special: { onDate: string | null; daysOfWeek: number[] | null }, dateStr: string): boolean {
  if (special.onDate) return special.onDate === dateStr
  const days = special.daysOfWeek
  return !days || days.length === 0 || days.includes(weekdayOf(dateStr))
}

function rowsToViews(rows: Row[]): SpecialView[] {
  return rows.map(({ special, item, categoryName }) => ({
    id: special.id,
    menuItemId: item.id,
    source: categoryName === SPECIALS_CATEGORY_NAME ? 'custom' : 'menu_item',
    name: item.name,
    description: item.description,
    pricePaise: item.priceMode === 'fixed' ? item.basePricePaise : null,
    isVeg: item.isVeg,
    onDate: special.onDate,
    daysOfWeek: special.daysOfWeek,
  }))
}

const joinedSelect = () =>
  db
    .select({ special: dailySpecials, item: menuItems, categoryName: categories.name })
    .from(dailySpecials)
    .innerJoin(menuItems, eq(dailySpecials.menuItemId, menuItems.id))
    .innerJoin(categories, eq(menuItems.categoryId, categories.id))

/**
 * The owner's current and future plan: every entry that is not removed, and -
 * if it is a one-off - has not already had its day. A past one-off quietly
 * drops out of this list on its own; its row lives on for history.
 */
export async function listAllSpecials(): Promise<SpecialView[]> {
  const today = await todayBusinessDate()
  const rows = await joinedSelect()
    .where(
      and(
        isNull(dailySpecials.removedAt),
        eq(menuItems.available, true),
        or(isNull(dailySpecials.onDate), gte(dailySpecials.onDate, today)),
      ),
    )
    .orderBy(asc(dailySpecials.id))
  return rowsToViews(rows)
}

/** What actually shows today: the plan, filtered to entries scheduled for today. */
export async function listActiveSpecials(at: Date = new Date()): Promise<SpecialView[]> {
  const today = await todayBusinessDate(at)
  const all = await listAllSpecials()
  return all.filter((special) => scheduledOn(special, today))
}

/** The ids behind what's active today, for the pinned ordering tab. */
export async function specialMenuItemIds(at: Date = new Date()): Promise<number[]> {
  return (await listActiveSpecials(at)).map((special) => special.menuItemId)
}

/**
 * What was live on a past (or future) business date. Reconstructed from each
 * row's createdAt/removedAt window plus its *current* schedule - if the owner
 * has since turned a one-off into a repeat (or changed its days), history
 * re-reads through today's version of that rule rather than whatever it was
 * on that date. Simpler than a full change log, and accurate for the common
 * case of the schedule never changing once set.
 */
export async function specialsHistory(dateStr: string): Promise<SpecialView[]> {
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`)

  const rows = await joinedSelect()
    .where(
      and(
        lte(dailySpecials.createdAt, dayEnd),
        or(isNull(dailySpecials.removedAt), sql`${dailySpecials.removedAt} > ${dayStart}`),
      ),
    )
    .orderBy(asc(dailySpecials.id))

  return rowsToViews(rows).filter((special) => scheduledOn(special, dateStr))
}

function normaliseDays(days: readonly number[] | null | undefined): number[] | null {
  if (!days || days.length === 0) return null
  const unique = [...new Set(days)]
  if (unique.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw ApiError.badRequest('Days must be between 0 (Sunday) and 6 (Saturday).')
  }
  return unique.sort((a, b) => a - b)
}

async function assertNotAlreadySpecial(menuItemId: number): Promise<void> {
  const today = await todayBusinessDate()
  const existing = (
    await db
      .select({ id: dailySpecials.id })
      .from(dailySpecials)
      .where(
        and(
          eq(dailySpecials.menuItemId, menuItemId),
          isNull(dailySpecials.removedAt),
          or(isNull(dailySpecials.onDate), gte(dailySpecials.onDate, today)),
        ),
      )
      .limit(1)
  )[0]
  if (existing) throw ApiError.conflict('That item is already a special.')
}

/** New specials default to "just today" - the owner opts into a repeat afterwards. */
export async function addMenuItemSpecial(menuItemId: number): Promise<void> {
  const item = (await db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.id, menuItemId)).limit(1))[0]
  if (!item) throw ApiError.notFound('That item is not on the menu.')
  await assertNotAlreadySpecial(menuItemId)
  await db.insert(dailySpecials).values({ menuItemId, onDate: await todayBusinessDate() })
}

/** Finds the reserved category for custom-typed specials, creating it the first time one is added. */
async function specialsCategoryId(): Promise<number> {
  const existing = (
    await db.select({ id: categories.id }).from(categories).where(eq(categories.name, SPECIALS_CATEGORY_NAME)).limit(1)
  )[0]
  if (existing) return existing.id

  const created = (
    await db
      .insert(categories)
      .values({
        name: SPECIALS_CATEGORY_NAME,
        group: 'food',
        note: "Dishes typed in fresh from Today's Special, not originally on the card.",
        sort: 9999,
      })
      .returning({ id: categories.id })
  )[0]
  if (!created) throw new Error('Could not create the Specials category')
  return created.id
}

/**
 * A dish that is not on the regular menu at all: a real menu item is created
 * for it under the reserved Specials category - fixed-price if the owner gave
 * one, otherwise ask-for-price, exactly like any other item priced that way -
 * so it can be edited, 86'd and ordered through the normal flow. Defaults to
 * "just today", same as a menu-sourced pick.
 */
export async function addCustomSpecial(input: {
  name: string
  description?: string | null
  pricePaise?: number | null
  isVeg?: boolean | null
}): Promise<void> {
  const categoryId = await specialsCategoryId()
  const created = (
    await db
      .insert(menuItems)
      .values({
        categoryId,
        name: input.name,
        description: input.description ?? null,
        priceMode: input.pricePaise != null ? 'fixed' : 'ask',
        basePricePaise: input.pricePaise ?? null,
        isVeg: input.isVeg ?? null,
      })
      .returning({ id: menuItems.id })
  )[0]
  if (!created) throw new Error('Could not add the item')
  await db.insert(dailySpecials).values({ menuItemId: created.id, onDate: await todayBusinessDate() })
}

/** Turns a special into a weekly repeat (or changes which days it repeats on), clearing any one-off date. */
export async function updateSpecialDays(id: number, days: readonly number[] | null): Promise<void> {
  const updated = await db
    .update(dailySpecials)
    .set({ onDate: null, daysOfWeek: normaliseDays(days) })
    .where(and(eq(dailySpecials.id, id), isNull(dailySpecials.removedAt)))
    .returning({ id: dailySpecials.id })
  if (updated.length === 0) throw ApiError.notFound('That special is not active.')
}

export async function removeSpecial(id: number): Promise<void> {
  const removed = await db
    .update(dailySpecials)
    .set({ removedAt: new Date() })
    .where(and(eq(dailySpecials.id, id), isNull(dailySpecials.removedAt)))
    .returning({ id: dailySpecials.id })
  if (removed.length === 0) throw ApiError.notFound('That special is already gone.')
}
