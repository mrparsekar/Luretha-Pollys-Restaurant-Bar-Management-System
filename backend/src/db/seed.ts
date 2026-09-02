import { count } from 'drizzle-orm'

import { env } from '../env'
import { hashSecret } from '../lib/password'
import { getSettings } from '../services/settings'
import { closeDb, db, isEmbedded } from './index'
import { categories, diningTables, itemVariants, menuItems, staff } from './schema'
import { SEED_MENU } from './seed-data/menu'
import { SEED_TABLES } from './seed-data/tables'

/**
 * Idempotent. Safe to run against a database that is already in service:
 *
 *  - the settings row and the two seed accounts are created only if missing,
 *  - tables are inserted by label and existing labels are left alone,
 *  - the menu is only written into an empty menu. Re-transcribing prices later
 *    is the menu manager's job, not the seeder's - except with --reset-menu,
 *    which is for development.
 */

const RESET_MENU = process.argv.includes('--reset-menu')

async function seedStaff(): Promise<void> {
  const existing = await db.select({ n: count() }).from(staff)
  if (Number(existing[0]?.n ?? 0) > 0) {
    console.log('- staff: already present, skipped')
    return
  }

  await db.insert(staff).values({
    name: env.seed.ownerName,
    role: 'owner',
    email: env.seed.ownerEmail,
    passwordHash: await hashSecret(env.seed.ownerPassword),
  })
  await db.insert(staff).values({
    name: env.seed.waiterName,
    role: 'waiter',
    pinHash: await hashSecret(env.seed.waiterPin),
  })

  console.log(`- staff: owner ${env.seed.ownerEmail} + waiter "${env.seed.waiterName}"`)
  if (env.seed.ownerPassword === 'changeme123' || env.seed.waiterPin === '1234') {
    console.log('  ! change SEED_OWNER_PASSWORD / SEED_WAITER_PIN before go-live')
  }
}

async function seedTables(): Promise<void> {
  let added = 0
  for (const [index, table] of SEED_TABLES.entries()) {
    const inserted = await db
      .insert(diningTables)
      .values({ ...table, sort: index })
      .onConflictDoNothing({ target: diningTables.label })
      .returning({ id: diningTables.id })
    if (inserted.length > 0) added += 1
  }
  console.log(`- tables: ${added} added, ${SEED_TABLES.length - added} already there`)
}

function toPaise(rupees: number): number {
  return Math.round(rupees * 100)
}

async function seedMenu(): Promise<void> {
  const existing = await db.select({ n: count() }).from(categories)
  const hasMenu = Number(existing[0]?.n ?? 0) > 0

  if (hasMenu && !RESET_MENU) {
    console.log('- menu: already present, skipped (run with --reset-menu to replace it)')
    return
  }
  if (hasMenu) {
    // order_items keep their own name/price snapshots, so wiping the live menu
    // cannot change a bill that has already been printed.
    await db.delete(itemVariants)
    await db.delete(menuItems)
    await db.delete(categories)
    console.log('- menu: cleared')
  }

  let itemCount = 0
  let variantCount = 0
  let askCount = 0

  for (const [categoryIndex, category] of SEED_MENU.entries()) {
    const inserted = await db
      .insert(categories)
      .values({
        name: category.name,
        group: category.group,
        note: category.note ?? null,
        sort: categoryIndex,
      })
      .returning({ id: categories.id })
    const categoryId = inserted[0]?.id
    if (!categoryId) throw new Error(`Could not insert category ${category.name}`)

    for (const [itemIndex, item] of category.items.entries()) {
      const mode = item.ask ? 'ask' : item.variants ? 'variant' : 'fixed'
      const row = await db
        .insert(menuItems)
        .values({
          categoryId,
          name: item.name,
          description: item.desc ?? null,
          priceMode: mode,
          basePricePaise: item.rupees === undefined ? null : toPaise(item.rupees),
          isVeg: item.veg ?? null,
          availFrom: item.from ?? null,
          availTo: item.to ?? null,
          note: item.note ?? null,
          sort: itemIndex,
        })
        .returning({ id: menuItems.id })
      const itemId = row[0]?.id
      if (!itemId) throw new Error(`Could not insert item ${item.name}`)
      itemCount += 1
      if (mode === 'ask') askCount += 1

      for (const [variantIndex, variant] of (item.variants ?? []).entries()) {
        await db.insert(itemVariants).values({
          itemId,
          label: variant.label,
          pricePaise: variant.rupees === null ? null : toPaise(variant.rupees),
          sort: variantIndex,
        })
        variantCount += 1
      }
    }
  }

  console.log(
    `- menu: ${SEED_MENU.length} sections, ${itemCount} items, ${variantCount} variants,` +
      ` ${askCount} ask-for-price`,
  )
}

async function main(): Promise<void> {
  console.log(`Seeding ${isEmbedded() ? 'embedded Postgres (.data/pg)' : 'DATABASE_URL'} ...`)
  const settings = await getSettings()
  console.log(`- settings: ${settings.restaurantName}`)
  await seedStaff()
  await seedTables()
  await seedMenu()
  console.log('Done.')
}

main()
  .then(async () => {
    await closeDb()
    process.exit(0)
  })
  .catch(async (error) => {
    console.error(error)
    await closeDb()
    process.exit(1)
  })
