import { describe, expect, it } from 'vitest'

import {
  computeTotals,
  formatPaise,
  formatRupees,
  isLiquorGroup,
  lineTotalPaise,
  MAX_ITEM_PRICE_PAISE,
  rupeesToPaise,
  type DiscountInput,
  type LineLike,
  type TaxConfig,
} from './money'

const NO_TAX: TaxConfig = {
  taxEnabled: false,
  foodTaxBps: 0,
  liquorTaxBps: 0,
  serviceChargeBps: 0,
}
const NO_DISCOUNT: DiscountInput = { discountType: 'none', discountValue: 0 }

function food(unitPricePaise: number, qty = 1, status?: LineLike['status']): LineLike {
  return { groupSnapshot: 'food', unitPricePaise, qty, status }
}
function bar(unitPricePaise: number, qty = 1, status?: LineLike['status']): LineLike {
  return { groupSnapshot: 'bar', unitPricePaise, qty, status }
}

describe('isLiquorGroup', () => {
  it('treats only the bar group as liquor', () => {
    expect(isLiquorGroup('bar')).toBe(true)
    for (const group of ['food', 'breakfast', 'beverage', 'dessert'] as const) {
      expect(isLiquorGroup(group)).toBe(false)
    }
  })
})

describe('lineTotalPaise', () => {
  it('multiplies the frozen unit price by qty', () => {
    expect(lineTotalPaise(food(18_000, 3))).toBe(54_000)
  })
})

describe('computeTotals - subtotal', () => {
  it('splits food and bar so the two tax buckets stay separate', () => {
    // 2 x Rs 180 food + 1 x Rs 130 peg
    const totals = computeTotals([food(18_000, 2), bar(13_000)], NO_DISCOUNT, NO_TAX)
    expect(totals.foodSubtotalPaise).toBe(36_000)
    expect(totals.liquorSubtotalPaise).toBe(13_000)
    expect(totals.subtotalPaise).toBe(49_000)
    expect(totals.totalPaise).toBe(49_000)
  })

  it('counts a variant line at the variant price it was ordered at', () => {
    // 60ml at Rs 130 and 30ml at Rs 70 of the same spirit are separate lines.
    const totals = computeTotals([bar(13_000), bar(7_000, 2)], NO_DISCOUNT, NO_TAX)
    expect(totals.liquorSubtotalPaise).toBe(27_000)
  })

  it('counts an ask-price line at the price the waiter keyed in', () => {
    const totals = computeTotals([food(45_000)], NO_DISCOUNT, NO_TAX)
    expect(totals.subtotalPaise).toBe(45_000)
  })

  it('leaves voided lines out of every figure', () => {
    const totals = computeTotals(
      [food(20_000), food(50_000, 2, 'void'), bar(10_000, 1, 'served')],
      NO_DISCOUNT,
      NO_TAX,
    )
    expect(totals.subtotalPaise).toBe(30_000)
    expect(totals.foodSubtotalPaise).toBe(20_000)
    expect(totals.liquorSubtotalPaise).toBe(10_000)
  })

  it('returns all zeroes for an empty tab', () => {
    const totals = computeTotals([], NO_DISCOUNT, NO_TAX)
    expect(totals).toMatchObject({ subtotalPaise: 0, discountPaise: 0, totalPaise: 0, roundOffPaise: 0 })
  })
})

describe('computeTotals - discount', () => {
  it('takes a flat amount off', () => {
    const totals = computeTotals([food(50_000)], { discountType: 'amount', discountValue: 5_000 }, NO_TAX)
    expect(totals.discountPaise).toBe(5_000)
    expect(totals.totalPaise).toBe(45_000)
  })

  it('reads a percent discount as basis points', () => {
    const totals = computeTotals([food(50_000)], { discountType: 'percent', discountValue: 1_000 }, NO_TAX)
    expect(totals.discountPaise).toBe(5_000)
    expect(totals.totalPaise).toBe(45_000)
  })

  it('never lets a discount exceed the subtotal', () => {
    const totals = computeTotals(
      [food(20_000)],
      { discountType: 'amount', discountValue: 99_000 },
      NO_TAX,
    )
    expect(totals.discountPaise).toBe(20_000)
    expect(totals.totalPaise).toBe(0)
  })

  it('clamps a percent above 100 to the whole bill', () => {
    const totals = computeTotals(
      [food(20_000)],
      { discountType: 'percent', discountValue: 12_345 },
      NO_TAX,
    )
    expect(totals.discountPaise).toBe(20_000)
  })

  it('ignores a negative discount instead of adding to the bill', () => {
    const totals = computeTotals(
      [food(20_000)],
      { discountType: 'amount', discountValue: -5_000 },
      NO_TAX,
    )
    expect(totals.discountPaise).toBe(0)
    expect(totals.totalPaise).toBe(20_000)
  })

  it('discounts nothing when the type is none, whatever the value', () => {
    const totals = computeTotals([food(20_000)], { discountType: 'none', discountValue: 5_000 }, NO_TAX)
    expect(totals.discountPaise).toBe(0)
  })
})

describe('computeTotals - tax', () => {
  const TAXED: TaxConfig = {
    taxEnabled: true,
    foodTaxBps: 500, // 5% GST
    liquorTaxBps: 2_000, // 20% VAT
    serviceChargeBps: 0,
  }

  it('adds nothing while the owner leaves tax switched off', () => {
    const totals = computeTotals([food(10_000), bar(10_000)], NO_DISCOUNT, {
      ...TAXED,
      taxEnabled: false,
    })
    expect(totals.taxPaise).toBe(0)
    expect(totals.totalPaise).toBe(20_000)
  })

  it('taxes food and liquor at their own rates', () => {
    const totals = computeTotals([food(10_000), bar(10_000)], NO_DISCOUNT, TAXED)
    expect(totals.foodTaxPaise).toBe(500)
    expect(totals.liquorTaxPaise).toBe(2_000)
    expect(totals.taxPaise).toBe(2_500)
    expect(totals.totalPaise).toBe(22_500)
  })

  it('taxes the discounted value, splitting the discount by each bucket share', () => {
    // Rs 100 food + Rs 100 bar, 10% off => Rs 10 off each side.
    const totals = computeTotals(
      [food(10_000), bar(10_000)],
      { discountType: 'percent', discountValue: 1_000 },
      TAXED,
    )
    expect(totals.discountPaise).toBe(2_000)
    expect(totals.foodTaxPaise).toBe(450) // 5% of 9000
    expect(totals.liquorTaxPaise).toBe(1_800) // 20% of 9000
    // 20000 - 2000 + 2250 = 20250
    expect(totals.totalPaise).toBe(20_300) // rounded up from 202.50
    expect(totals.roundOffPaise).toBe(50)
  })

  it('keeps the food/liquor discount split adding back to the whole discount', () => {
    const totals = computeTotals(
      [food(3_333), bar(6_667)],
      { discountType: 'percent', discountValue: 3_333 },
      TAXED,
    )
    // Whatever the rounding does per bucket, the parts must equal the total.
    expect(totals.foodTaxPaise + totals.liquorTaxPaise).toBe(totals.taxPaise)
  })

  it('applies service charge after the discount and taxes it separately', () => {
    const totals = computeTotals([food(100_000)], NO_DISCOUNT, {
      taxEnabled: false,
      foodTaxBps: 0,
      liquorTaxBps: 0,
      serviceChargeBps: 500,
    })
    expect(totals.serviceChargePaise).toBe(5_000)
    expect(totals.totalPaise).toBe(105_000)
  })
})

describe('computeTotals - rounding', () => {
  it('rounds the bill to whole rupees and records the adjustment', () => {
    const totals = computeTotals([food(10_040)], NO_DISCOUNT, NO_TAX)
    expect(totals.totalPaise).toBe(10_000)
    expect(totals.roundOffPaise).toBe(-40)
  })

  it('rounds up past the half rupee', () => {
    const totals = computeTotals([food(10_060)], NO_DISCOUNT, NO_TAX)
    expect(totals.totalPaise).toBe(10_100)
    expect(totals.roundOffPaise).toBe(40)
  })

  it('records no adjustment when the bill is already whole rupees', () => {
    const totals = computeTotals([food(12_500, 2)], NO_DISCOUNT, NO_TAX)
    expect(totals.roundOffPaise).toBe(0)
    expect(totals.totalPaise).toBe(25_000)
  })

  it('always lands on a whole number of rupees', () => {
    for (const price of [1, 49, 50, 51, 99, 12_345, 99_999]) {
      const totals = computeTotals([food(price, 3)], { discountType: 'percent', discountValue: 777 }, {
        taxEnabled: true,
        foodTaxBps: 511,
        liquorTaxBps: 1_999,
        serviceChargeBps: 313,
      })
      expect(totals.totalPaise % 100).toBe(0)
      expect(Math.abs(totals.roundOffPaise)).toBeLessThanOrEqual(50)
    }
  })
})

describe('formatPaise', () => {
  it('drops the decimals for whole rupees', () => {
    expect(formatPaise(62_100)).toBe('621')
    expect(formatPaise(0)).toBe('0')
  })

  it('keeps two decimals when there are paise', () => {
    expect(formatPaise(123_450)).toBe('1,234.50')
    // A 10% discount on Rs 165. "16.5" on a guest's bill reads like a mistake.
    expect(formatPaise(1_650)).toBe('16.50')
    expect(formatPaise(9_45)).toBe('9.45')
  })

  it('groups in the Indian style', () => {
    expect(formatPaise(1_234_567_800)).toBe('1,23,45,678')
  })

  it('keeps the sign on a negative, for discount and round-off rows', () => {
    expect(formatPaise(-6_900)).toBe('-69')
    expect(formatRupees(-6_900)).toBe('Rs -69')
  })
})

describe('rupeesToPaise', () => {
  it('accepts the shapes a keypad produces', () => {
    expect(rupeesToPaise('350')).toBe(35_000)
    expect(rupeesToPaise('350.5')).toBe(35_050)
    expect(rupeesToPaise('350.55')).toBe(35_055)
    expect(rupeesToPaise(' 450 ')).toBe(45_000)
    expect(rupeesToPaise(450)).toBe(45_000)
  })

  it('rejects anything that is not a plain amount', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1,000', '12e3']) {
      expect(() => rupeesToPaise(bad)).toThrow(/Invalid amount/)
    }
  })

  it('rejects an amount above the sanity bound', () => {
    expect(() => rupeesToPaise('9999999')).toThrow(/out of range/)
    expect(rupeesToPaise(MAX_ITEM_PRICE_PAISE / 100)).toBe(MAX_ITEM_PRICE_PAISE)
  })
})
