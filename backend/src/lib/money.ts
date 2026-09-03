import type { MenuGroup } from '../db/schema.js'

/**
 * All money in this codebase is integer paise. Nothing is a float, and the only
 * places rupees appear are the formatters at the bottom of this file.
 */

export const MAX_ITEM_PRICE_PAISE = 10_000_000 // Rs 1,00,000 - sanity bound on ask-price entry

export type LineLike = {
  groupSnapshot: MenuGroup
  unitPricePaise: number
  qty: number
  status?: 'placed' | 'served' | 'void' | null
}

export type TaxConfig = {
  taxEnabled: boolean
  foodTaxBps: number
  liquorTaxBps: number
  serviceChargeBps: number
}

export type DiscountInput = {
  discountType: 'none' | 'amount' | 'percent'
  /** Paise when type is 'amount', basis points when 'percent' (1000 = 10%). */
  discountValue: number
}

export type Totals = {
  subtotalPaise: number
  foodSubtotalPaise: number
  liquorSubtotalPaise: number
  discountPaise: number
  foodTaxPaise: number
  liquorTaxPaise: number
  taxPaise: number
  serviceChargePaise: number
  roundOffPaise: number
  totalPaise: number
}

/** Bar lines are taxed (and reported) separately from everything else. */
export function isLiquorGroup(group: MenuGroup): boolean {
  return group === 'bar'
}

function bpsOf(amountPaise: number, bps: number): number {
  if (amountPaise <= 0 || bps <= 0) return 0
  return Math.round((amountPaise * bps) / 10_000)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function lineTotalPaise(line: LineLike): number {
  return line.unitPricePaise * line.qty
}

export function computeTotals(
  lines: readonly LineLike[],
  discount: DiscountInput,
  tax: TaxConfig,
): Totals {
  const live = lines.filter((l) => l.status !== 'void')

  let foodSubtotalPaise = 0
  let liquorSubtotalPaise = 0
  for (const line of live) {
    const amount = lineTotalPaise(line)
    if (isLiquorGroup(line.groupSnapshot)) liquorSubtotalPaise += amount
    else foodSubtotalPaise += amount
  }
  const subtotalPaise = foodSubtotalPaise + liquorSubtotalPaise

  let discountPaise = 0
  if (discount.discountType === 'amount') {
    discountPaise = clamp(Math.round(discount.discountValue), 0, subtotalPaise)
  } else if (discount.discountType === 'percent') {
    const bps = clamp(Math.round(discount.discountValue), 0, 10_000)
    discountPaise = clamp(bpsOf(subtotalPaise, bps), 0, subtotalPaise)
  }

  // Split the discount across food and liquor in proportion to their share, so a
  // 10% off never quietly moves value from one tax bucket to the other.
  const liquorDiscount =
    subtotalPaise > 0 ? Math.round((discountPaise * liquorSubtotalPaise) / subtotalPaise) : 0
  const foodDiscount = discountPaise - liquorDiscount

  const foodTaxPaise = tax.taxEnabled ? bpsOf(foodSubtotalPaise - foodDiscount, tax.foodTaxBps) : 0
  const liquorTaxPaise = tax.taxEnabled
    ? bpsOf(liquorSubtotalPaise - liquorDiscount, tax.liquorTaxBps)
    : 0
  const taxPaise = foodTaxPaise + liquorTaxPaise

  const serviceChargePaise = bpsOf(subtotalPaise - discountPaise, tax.serviceChargeBps)

  const gross = subtotalPaise - discountPaise + taxPaise + serviceChargePaise
  const rounded = Math.round(gross / 100) * 100
  const roundOffPaise = rounded - gross

  return {
    subtotalPaise,
    foodSubtotalPaise,
    liquorSubtotalPaise,
    discountPaise,
    foodTaxPaise,
    liquorTaxPaise,
    taxPaise,
    serviceChargePaise,
    roundOffPaise,
    totalPaise: rounded,
  }
}

const whole = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
/**
 * Two decimals or none, never one: a 10% discount on Rs 165 is 16 50 paise, and
 * "16.5" on a guest's bill reads like a mistake.
 */
const withPaise = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 123450 -> "1,234.50"; 123400 -> "1,234". No currency symbol. */
export function formatPaise(paise: number): string {
  const negative = paise < 0
  const abs = Math.abs(paise)
  const text = abs % 100 === 0 ? whole.format(abs / 100) : withPaise.format(abs / 100)
  return negative ? `-${text}` : text
}

export function formatRupees(paise: number): string {
  return `Rs ${formatPaise(paise)}`
}

/** Accepts "350", "350.5", 350 -> paise. Throws on anything else. */
export function rupeesToPaise(input: string | number): number {
  const raw = typeof input === 'number' ? input.toString() : input.trim()
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(raw)) {
    throw new Error(`Invalid amount: ${input}`)
  }
  const paise = Math.round(Number(raw) * 100)
  if (paise < 0 || paise > MAX_ITEM_PRICE_PAISE) {
    throw new Error(`Amount out of range: ${input}`)
  }
  return paise
}
