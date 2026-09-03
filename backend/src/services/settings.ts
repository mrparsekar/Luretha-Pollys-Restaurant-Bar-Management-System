import { eq } from 'drizzle-orm'

import { db } from '../db/index.js'
import { settings, type Settings } from '../db/schema.js'
import { recordAudit } from '../lib/audit.js'
import type { TaxConfig } from '../lib/money.js'
import type { SessionPayload } from '../lib/session.js'

export const SETTINGS_ID = 1

/** Straight off the printed menu and the shopfront. The owner can edit all of it. */
export const SETTINGS_DEFAULTS = {
  id: SETTINGS_ID,
  restaurantName: 'Luretha & Pollys Bar & Restaurant',
  tagline: 'Since 1992',
  address: 'Maddo Vaddo, Calangute Beach, Calangute, Goa 403516',
  phonePrimary: '9309245800',
  phoneSecondary: '7038571410',
  instagram: 'lurethaandpollys',
  upiId: null as string | null,
  upiPayeeName: 'Luretha & Pollys',
  reviewUrl: null as string | null,
  billFooter: 'Thank you for dining with us. Please visit again!',
  taxEnabled: false,
  foodTaxBps: 0,
  liquorTaxBps: 0,
  serviceChargeBps: 0,
  businessDayStartHour: 6,
} as const

/** Creates the single row on first call so a fresh database still answers. */
export async function getSettings(): Promise<Settings> {
  const existing = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1)
  const found = existing[0]
  if (found) return found

  await db.insert(settings).values({ ...SETTINGS_DEFAULTS }).onConflictDoNothing()
  const created = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1)
  const row = created[0]
  if (!row) throw new Error('Could not initialise settings row')
  return row
}

export function taxConfigOf(row: Settings): TaxConfig {
  return {
    taxEnabled: row.taxEnabled,
    foodTaxBps: row.foodTaxBps,
    liquorTaxBps: row.liquorTaxBps,
    serviceChargeBps: row.serviceChargeBps,
  }
}

export async function taxConfig(): Promise<TaxConfig> {
  return taxConfigOf(await getSettings())
}

export type SettingsPatch = Partial<Omit<Settings, 'id' | 'updatedAt'>>

/** Tax rates change what guests are charged, so every edit is logged. */
export async function updateSettings(
  patch: SettingsPatch,
  session?: SessionPayload,
): Promise<Settings> {
  const before = await getSettings()
  const updated = await db
    .update(settings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(settings.id, SETTINGS_ID))
    .returning()
  const row = updated[0]
  if (!row) throw new Error('Could not update settings')

  const changed = Object.keys(patch).filter(
    (key) => before[key as keyof Settings] !== row[key as keyof Settings],
  )
  if (changed.length > 0) {
    await recordAudit({
      actorId: session?.sub ?? null,
      action: 'settings.update',
      entity: 'settings',
      entityId: SETTINGS_ID,
      before: pick(before, changed),
      after: pick(row, changed),
    })
  }
  return row
}

function pick(row: Settings, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of keys) out[key] = row[key as keyof Settings]
  return out
}
