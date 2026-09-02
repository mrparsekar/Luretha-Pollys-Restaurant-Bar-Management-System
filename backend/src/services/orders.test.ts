import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '../db'
import { menuItems, orders, settings } from '../db/schema'
import { buildBill, whatsappText } from '../lib/bill'
import { businessDate } from '../lib/time'
import {
  caught,
  DISH_PAISE,
  LARGE_POUR_PAISE,
  setupTestDb,
  SMALL_POUR_PAISE,
  type Fixtures,
} from '../test/fixtures'
import { getSettings, SETTINGS_ID, updateSettings } from './settings'
import {
  addItems,
  getOrderDetail,
  markBilled,
  openOrder,
  setDiscount,
  settleOrder,
  voidItem,
  type NewItemInput,
} from './orders'

let f: Fixtures

/** Freezes the clock at a given IST wall time on 2 Sep 2026. */
function atGoaTime(hhmm: string): void {
  const [h, m] = hhmm.split(':').map(Number)
  vi.setSystemTime(new Date(Date.UTC(2026, 8, 2, h!, m!) - 330 * 60_000))
}

beforeAll(async () => {
  f = await setupTestDb()
  // Only Date is faked; PGlite's own timers must keep running for real.
  vi.useFakeTimers({ toFake: ['Date'] })
  atGoaTime('20:00')
})

afterAll(() => {
  vi.useRealTimers()
})

// Service hours, so nothing is accidentally gated. Tests that care set their own.
beforeEach(() => {
  atGoaTime('20:00')
})

afterEach(async () => {
  await updateSettings({
    taxEnabled: false,
    foodTaxBps: 0,
    liquorTaxBps: 0,
    serviceChargeBps: 0,
  })
  await db.update(menuItems).set({ basePricePaise: DISH_PAISE }).where(eq(menuItems.id, f.dish))
})

/** Opens a takeaway tab, which needs no table and so never collides. */
async function takeaway() {
  return openOrder({ orderType: 'takeaway' }, f.waiter)
}

async function withItems(...items: NewItemInput[]) {
  const order = await takeaway()
  await addItems(order.id, items, f.waiter)
  return order
}

const dish = (qty = 1): NewItemInput => ({ menuItemId: f.dish, qty })
const peg = (qty = 1): NewItemInput => ({ menuItemId: f.spirit.id, variantId: f.spirit.large, qty })

describe('order numbers', () => {
  it('starts the day at 1 and counts up', async () => {
    atGoaTime('11:00')
    const first = await takeaway()
    const second = await takeaway()
    expect(first.orderNo).toBe(1)
    expect(second.orderNo).toBe(2)
    expect(first.businessDate).toBe('2026-09-02')
  })

  it('gives two waiters opening a tab at the same moment different numbers', async () => {
    // PGlite serialises these, so what this pins down is the UPSERT contract: no
    // two orders on one business date can ever share a number.
    const opened = await Promise.all(Array.from({ length: 8 }, () => takeaway()))
    const numbers = opened.map((o) => o.orderNo).sort((a, b) => a - b)
    expect(new Set(numbers).size).toBe(8)
    expect(numbers[7]! - numbers[0]!).toBe(7)
  })

  it('does not burn a number when the table is already busy', async () => {
    const first = await openOrder({ orderType: 'dine_in', diningTableId: f.tableId }, f.waiter)
    const clash = await caught(() =>
      openOrder({ orderType: 'dine_in', diningTableId: f.tableId }, f.otherWaiter),
    )
    expect(clash.status).toBe(409)
    expect(clash.message).toContain(`order #${first.orderNo}`)

    const next = await takeaway()
    expect(next.orderNo).toBe(first.orderNo + 1)
  })

  it('rejects a dine-in order with no table and a table that does not exist', async () => {
    expect((await caught(() => openOrder({ orderType: 'dine_in' }, f.waiter))).status).toBe(400)
    expect(
      (await caught(() => openOrder({ orderType: 'dine_in', diningTableId: 9_999 }, f.waiter))).status,
    ).toBe(404)
  })

  it('restarts the sequence when the business day rolls at 6am IST', async () => {
    // 05:59 IST on the 3rd still belongs to the 2nd.
    vi.setSystemTime(new Date('2026-09-03T00:29:00Z'))
    const lateNight = await takeaway()
    expect(lateNight.businessDate).toBe('2026-09-02')

    // 06:00 IST is a new sheet, and the numbering starts over.
    vi.setSystemTime(new Date('2026-09-03T00:30:00Z'))
    const morning = await takeaway()
    expect(morning.businessDate).toBe('2026-09-03')
    expect(morning.orderNo).toBe(1)

    const second = await takeaway()
    expect(second.orderNo).toBe(2)

    // And the previous day's counter is untouched.
    vi.setSystemTime(new Date('2026-09-03T00:29:00Z'))
    const back = await takeaway()
    expect(back.businessDate).toBe('2026-09-02')
    expect(back.orderNo).toBe(lateNight.orderNo + 1)
  })

  it('agrees with the standalone business-date helper', async () => {
    atGoaTime('21:30')
    const order = await takeaway()
    const config = await getSettings()
    expect(order.businessDate).toBe(businessDate(new Date(), config.businessDayStartHour))
  })
})

describe('adding items', () => {
  it('prices a fixed item off the menu and totals the round', async () => {
    const order = await withItems(dish(2))
    const detail = await getOrderDetail(order.id)
    expect(detail.items).toHaveLength(1)
    expect(detail.items[0]).toMatchObject({
      nameSnapshot: 'Test Cafreal',
      variantSnapshot: null,
      categorySnapshot: 'Test Kitchen',
      groupSnapshot: 'food',
      unitPricePaise: DISH_PAISE,
      qty: 2,
      status: 'placed',
      roundNo: 1,
    })
    expect(detail.order.subtotalPaise).toBe(DISH_PAISE * 2)
    expect(detail.order.totalPaise).toBe(DISH_PAISE * 2)
  })

  it('prices a variant item at the size ordered', async () => {
    const order = await withItems(
      { menuItemId: f.spirit.id, variantId: f.spirit.small, qty: 1 },
      { menuItemId: f.spirit.id, variantId: f.spirit.large, qty: 2 },
    )
    const detail = await getOrderDetail(order.id)
    expect(detail.items.map((i) => [i.variantSnapshot, i.unitPricePaise])).toEqual([
      ['30ml', SMALL_POUR_PAISE],
      ['60ml', LARGE_POUR_PAISE],
    ])
    expect(detail.order.subtotalPaise).toBe(SMALL_POUR_PAISE + LARGE_POUR_PAISE * 2)
  })

  it('insists on a size for a variant item', async () => {
    const order = await takeaway()
    const error = await caught(() => addItems(order.id, [{ menuItemId: f.spirit.id, qty: 1 }], f.waiter))
    expect(error.status).toBe(400)
    expect(error.message).toBe('Choose a size for Test Rum.')
  })

  it('rejects a size that does not belong to the item', async () => {
    const order = await takeaway()
    const error = await caught(() =>
      addItems(order.id, [{ menuItemId: f.spirit.id, variantId: 9_999, qty: 1 }], f.waiter),
    )
    expect(error.status).toBe(400)
    expect(error.message).toBe('That size is not available for Test Rum.')
  })

  it('asks for a price on the ask-for-price seafood', async () => {
    const order = await takeaway()
    const error = await caught(() => addItems(order.id, [{ menuItemId: f.askPrice, qty: 1 }], f.waiter))
    expect(error.status).toBe(400)
    expect(error.message).toBe('Enter the price for Test Prawns.')
  })

  it('takes the price the waiter keyed in', async () => {
    const order = await withItems({ menuItemId: f.askPrice, qty: 1, unitPricePaise: 45_000 })
    const detail = await getOrderDetail(order.id)
    expect(detail.items[0]!.unitPricePaise).toBe(45_000)
    expect(detail.order.subtotalPaise).toBe(45_000)
  })

  it('refuses a keyed-in price that is obviously wrong', async () => {
    const order = await takeaway()
    for (const unitPricePaise of [0, -100, 20_000_000]) {
      const error = await caught(() =>
        addItems(order.id, [{ menuItemId: f.askPrice, qty: 1, unitPricePaise }], f.waiter),
      )
      expect(error.status).toBe(400)
      expect(error.message).toContain('looks wrong')
    }
  })

  it('refuses an impossible quantity', async () => {
    const order = await takeaway()
    for (const qty of [0, -1, 100]) {
      const error = await caught(() => addItems(order.id, [{ menuItemId: f.dish, qty }], f.waiter))
      expect(error.status).toBe(400)
      expect(error.message).toContain('between 1 and 99')
    }
  })

  it('refuses an empty round', async () => {
    const order = await takeaway()
    expect((await caught(() => addItems(order.id, [], f.waiter))).status).toBe(400)
  })

  it('keeps an 86ed item off the tab', async () => {
    const order = await takeaway()
    const error = await caught(() => addItems(order.id, [{ menuItemId: f.unavailable, qty: 1 }], f.waiter))
    expect(error.status).toBe(409)
    expect(error.message).toBe('Test Sold Out is off the menu right now.')
  })

  it('numbers each round so drinks then food stays in the order it was served', async () => {
    const order = await takeaway()
    const first = await addItems(order.id, [peg()], f.waiter)
    const second = await addItems(order.id, [dish()], f.waiter)
    const third = await addItems(order.id, [dish()], f.waiter)
    expect([first.roundNo, second.roundNo, third.roundNo]).toEqual([1, 2, 3])

    const detail = await getOrderDetail(order.id)
    expect(detail.items.map((i) => i.roundNo)).toEqual([1, 2, 3])
    expect(detail.order.subtotalPaise).toBe(LARGE_POUR_PAISE + DISH_PAISE * 2)
  })

  it('keeps the waiter note against the line', async () => {
    const order = await withItems({ menuItemId: f.dish, qty: 1, note: '  no onion  ' })
    const detail = await getOrderDetail(order.id)
    expect(detail.items[0]!.note).toBe('no onion')
  })
})

describe('time-gated items', () => {
  it('takes the evening steak inside its window', async () => {
    atGoaTime('19:30')
    const order = await withItems({ menuItemId: f.gated, qty: 1 })
    const detail = await getOrderDetail(order.id)
    expect(detail.items[0]!.nameSnapshot).toBe('Test Beef Steak')
  })

  it('refuses it in the afternoon and says when it is served', async () => {
    atGoaTime('15:00')
    const order = await takeaway()
    const error = await caught(() => addItems(order.id, [{ menuItemId: f.gated, qty: 1 }], f.waiter))
    expect(error.status).toBe(409)
    expect(error.message).toBe('Test Beef Steak is served 7:00 PM to 10:00 PM only.')
  })
})

describe('snapshots', () => {
  it('holds the price the guest was quoted even after the owner edits the menu', async () => {
    const order = await withItems(dish(1))
    const before = await getOrderDetail(order.id)
    expect(before.order.subtotalPaise).toBe(DISH_PAISE)

    await db.update(menuItems).set({ basePricePaise: 99_900 }).where(eq(menuItems.id, f.dish))

    const after = await getOrderDetail(order.id)
    expect(after.items[0]!.unitPricePaise).toBe(DISH_PAISE)
    expect(after.order.subtotalPaise).toBe(DISH_PAISE)

    // A later round on the same tab does take the new price.
    await addItems(order.id, [dish()], f.waiter)
    const mixed = await getOrderDetail(order.id)
    expect(mixed.items.map((i) => i.unitPricePaise)).toEqual([DISH_PAISE, 99_900])
    expect(mixed.order.subtotalPaise).toBe(DISH_PAISE + 99_900)
  })

  it('keeps the name even if the item is renamed', async () => {
    const order = await withItems(dish(1))
    await db.update(menuItems).set({ name: 'Renamed Dish' }).where(eq(menuItems.id, f.dish))
    const detail = await getOrderDetail(order.id)
    expect(detail.items[0]!.nameSnapshot).toBe('Test Cafreal')
    await db.update(menuItems).set({ name: 'Test Cafreal' }).where(eq(menuItems.id, f.dish))
  })
})

describe('voiding a line', () => {
  it('takes the line off the total but leaves it on the record', async () => {
    const order = await withItems(dish(1), peg(1))
    const detail = await getOrderDetail(order.id)
    const line = detail.items.find((i) => i.nameSnapshot === 'Test Cafreal')!

    const after = await voidItem(order.id, line.id, 'guest changed their mind', f.owner)
    expect(after.subtotalPaise).toBe(LARGE_POUR_PAISE)
    expect(after.totalPaise).toBe(LARGE_POUR_PAISE)

    const reread = await getOrderDetail(order.id)
    const voided = reread.items.find((i) => i.id === line.id)!
    expect(voided.status).toBe('void')
    expect(voided.voidReason).toBe('guest changed their mind')
    expect(voided.voidedById).toBe(f.owner.sub)
  })

  it('insists on a reason', async () => {
    const order = await withItems(dish(1))
    const detail = await getOrderDetail(order.id)
    const error = await caught(() => voidItem(order.id, detail.items[0]!.id, ' x ', f.owner))
    expect(error.status).toBe(400)
    expect(error.message).toContain('reason')
  })

  it('will not void the same line twice', async () => {
    const order = await withItems(dish(1))
    const detail = await getOrderDetail(order.id)
    await voidItem(order.id, detail.items[0]!.id, 'wrong table', f.waiter)
    const error = await caught(() => voidItem(order.id, detail.items[0]!.id, 'again', f.waiter))
    expect(error.status).toBe(409)
  })
})
describe('discounts', () => {
  it('takes a flat amount off', async () => {
    const order = await withItems(dish(1))
    const after = await setDiscount(order.id, { discountType: 'amount', discountValue: 5_000 }, f.owner)
    expect(after.discountPaise).toBe(5_000)
    expect(after.totalPaise).toBe(DISH_PAISE - 5_000)
  })

  it('takes a percent off, stored as basis points', async () => {
    const order = await withItems(dish(1))
    const after = await setDiscount(order.id, { discountType: 'percent', discountValue: 1_000 }, f.owner)
    expect(after.discountValue).toBe(1_000)
    expect(after.discountPaise).toBe(1_800)
    expect(after.totalPaise).toBe(16_200)
  })

  it('never discounts more than the tab is worth', async () => {
    const order = await withItems(dish(1))
    const after = await setDiscount(order.id, { discountType: 'amount', discountValue: 50_000 }, f.owner)
    expect(after.discountPaise).toBe(DISH_PAISE)
    expect(after.totalPaise).toBe(0)
  })

  it('can be taken back off', async () => {
    const order = await withItems(dish(1))
    await setDiscount(order.id, { discountType: 'percent', discountValue: 1_000 }, f.owner)
    const after = await setDiscount(order.id, { discountType: 'none', discountValue: 0 }, f.owner)
    expect(after.discountPaise).toBe(0)
    expect(after.totalPaise).toBe(DISH_PAISE)
  })

  it('refuses nonsense input', async () => {
    const order = await withItems(dish(1))
    const cases: Array<[{ discountType: 'none' | 'amount' | 'percent'; discountValue: number }, string]> = [
      [{ discountType: 'percent', discountValue: 10_001 }, 'between 0 and 100'],
      [{ discountType: 'percent', discountValue: -1 }, 'between 0 and 100'],
      [{ discountType: 'amount', discountValue: 20_000_000 }, 'looks wrong'],
      [{ discountType: 'none', discountValue: 500 }, 'Remove the discount value'],
    ]
    for (const [patch, text] of cases) {
      const error = await caught(() => setDiscount(order.id, patch, f.owner))
      expect(error.status).toBe(400)
      expect(error.message).toContain(text)
    }
  })

  it('rounds the discounted bill to whole rupees and records the adjustment', async () => {
    // 33.33% of Rs 180 is Rs 59.99, which would otherwise leave paise on the bill.
    const order = await withItems(dish(1))
    const after = await setDiscount(order.id, { discountType: 'percent', discountValue: 3_333 }, f.owner)
    expect(after.discountPaise).toBe(5_999)
    expect(after.roundOffPaise).toBe(-1)
    expect(after.totalPaise).toBe(12_000)
    expect(after.totalPaise % 100).toBe(0)
  })
})
describe('tax, once the owner switches it on', () => {
  it('taxes food and liquor at their own rates', async () => {
    await updateSettings({ taxEnabled: true, foodTaxBps: 500, liquorTaxBps: 2_000 })
    const order = await withItems(dish(1), peg(1))
    const detail = await getOrderDetail(order.id)

    expect(detail.order.subtotalPaise).toBe(DISH_PAISE + LARGE_POUR_PAISE)
    expect(detail.order.taxPaise).toBe(900 + 2_600)
    expect(detail.order.totalPaise).toBe(DISH_PAISE + LARGE_POUR_PAISE + 3_500)
  })

  it('taxes what is left after a discount', async () => {
    await updateSettings({ taxEnabled: true, foodTaxBps: 500, liquorTaxBps: 0 })
    const order = await withItems(dish(1))
    const after = await setDiscount(order.id, { discountType: 'percent', discountValue: 1_000 }, f.owner)
    // 5% of the discounted Rs 162, then Rs 170.10 rounded down to a whole rupee.
    expect(after.taxPaise).toBe(810)
    expect(after.roundOffPaise).toBe(-10)
    expect(after.totalPaise).toBe(17_000)
  })

  it('adds a service charge on top of the discounted subtotal', async () => {
    await updateSettings({ serviceChargeBps: 500 })
    const order = await withItems(dish(1))
    const detail = await getOrderDetail(order.id)
    expect(detail.order.serviceChargePaise).toBe(900)
    expect(detail.order.totalPaise).toBe(DISH_PAISE + 900)
  })

  it('charges nothing extra while it stays off', async () => {
    const order = await withItems(dish(1), peg(1))
    const detail = await getOrderDetail(order.id)
    expect(detail.order.taxPaise).toBe(0)
    expect(detail.order.serviceChargePaise).toBe(0)
    expect(detail.order.totalPaise).toBe(detail.order.subtotalPaise)
  })
})

describe('who may touch an order', () => {
  it('stops a waiter working on another waiter s tab', async () => {
    const order = await takeaway()
    const error = await caught(() => addItems(order.id, [dish()], f.otherWaiter))
    expect(error.status).toBe(403)
    expect(error.message).toBe('This order belongs to another waiter.')
  })

  it('lets the owner work on anyone s tab', async () => {
    const order = await takeaway()
    const added = await addItems(order.id, [dish()], f.owner)
    expect(added.roundNo).toBe(1)
  })

  it('refuses to change a settled order', async () => {
    const order = await withItems(dish(1))
    await settleOrder(order.id, { paymentMode: 'cash' }, f.owner)
    const error = await caught(() => addItems(order.id, [dish()], f.waiter))
    expect(error.status).toBe(409)
    expect(error.message).toBe('This order is already settled.')
  })
})
describe('printing and settling', () => {
  it('gives the order a public token when the bill is printed', async () => {
    const order = await withItems(dish(1))
    expect(order.billToken).toBeNull()
    const billed = await markBilled(order.id, f.waiter)
    expect(billed.status).toBe('billed')
    expect(billed.billToken).toMatch(/^[\w-]{20,}$/)
    expect(billed.billedAt).toBeInstanceOf(Date)
  })

  it('reopens the tab for one more round, keeping the same token', async () => {
    const order = await withItems(peg(1))
    const billed = await markBilled(order.id, f.waiter)

    const added = await addItems(order.id, [dish()], f.waiter)
    expect(added.roundNo).toBe(2)
    expect(added.order.status).toBe('open')
    expect(added.order.billedAt).toBeNull()
    expect(added.order.billToken).toBe(billed.billToken)
    expect(added.order.totalPaise).toBe(LARGE_POUR_PAISE + DISH_PAISE)

    const rebilled = await markBilled(order.id, f.waiter)
    expect(rebilled.billToken).toBe(billed.billToken)
    expect(rebilled.totalPaise).toBe(LARGE_POUR_PAISE + DISH_PAISE)
  })

  it('refuses to bill or settle an empty tab', async () => {
    const order = await takeaway()
    expect((await caught(() => markBilled(order.id, f.waiter))).status).toBe(409)
    expect((await caught(() => settleOrder(order.id, { paymentMode: 'cash' }, f.owner))).status).toBe(409)
  })

  it('refuses to settle a tab whose only line was voided', async () => {
    const order = await withItems(dish(1))
    const detail = await getOrderDetail(order.id)
    await voidItem(order.id, detail.items[0]!.id, 'ordered by mistake', f.owner)
    const error = await caught(() => settleOrder(order.id, { paymentMode: 'upi' }, f.owner))
    expect(error.status).toBe(409)
    expect(error.message).toContain('no items')
  })

  it('records the payment mode, the guest and who settled it', async () => {
    const order = await withItems(dish(1), peg(1))
    const settled = await settleOrder(
      order.id,
      { paymentMode: 'upi', guestName: 'Ana', guestPhone: '+919309245800' },
      f.owner,
    )
    expect(settled.status).toBe('settled')
    expect(settled.paymentMode).toBe('upi')
    expect(settled.guestName).toBe('Ana')
    expect(settled.settledById).toBe(f.owner.sub)
    expect(settled.settledAt).toBeInstanceOf(Date)
    expect(settled.billToken).toMatch(/^[\w-]{20,}$/)
    expect(settled.totalPaise).toBe(DISH_PAISE + LARGE_POUR_PAISE)
  })

  it('settles straight from open, without a printed bill first', async () => {
    const order = await withItems(dish(1))
    const settled = await settleOrder(order.id, { paymentMode: 'cash' }, f.owner)
    expect(settled.billedAt).toBeInstanceOf(Date)
    expect(settled.settledAt).toBeInstanceOf(Date)
  })

  it('will not settle twice', async () => {
    const order = await withItems(dish(1))
    await settleOrder(order.id, { paymentMode: 'cash' }, f.owner)
    const error = await caught(() => settleOrder(order.id, { paymentMode: 'upi' }, f.owner))
    expect(error.status).toBe(409)
  })
})
describe('the bill a guest actually gets', () => {
  it('prints the live lines, the discount and a whole-rupee total', async () => {
    await updateSettings({ upiId: 'lurethapollys@upi' })

    const order = await openOrder(
      { orderType: 'dine_in', diningTableId: f.secondTableId, guests: 3 },
      f.waiter,
    )
    await addItems(order.id, [peg(2), dish(1)], f.waiter)
    await addItems(
      order.id,
      [{ menuItemId: f.askPrice, qty: 1, unitPricePaise: 45_000, note: 'extra spicy' }],
      f.waiter,
    )

    const opened = await getOrderDetail(order.id)
    const cafreal = opened.items.find((i) => i.nameSnapshot === 'Test Cafreal')!
    await voidItem(order.id, cafreal.id, 'sent to the wrong table', f.owner)
    await setDiscount(order.id, { discountType: 'percent', discountValue: 1_000 }, f.owner)
    await markBilled(order.id, f.waiter)
    await settleOrder(order.id, { paymentMode: 'upi', guestPhone: '9309245800' }, f.owner)

    const detail = await getOrderDetail(order.id)
    const config = await getSettings()
    const bill = buildBill(detail, config)

    expect(bill.restaurant.name).toBe('Luretha & Pollys Bar & Restaurant')
    expect(bill.order.tableLabel).toBe('Test 2')
    expect(bill.order.guests).toBe(3)
    expect(bill.order.paymentMode).toBe('upi')
    expect(bill.order.dateLabel).toBe('02 Sep 2026')

    expect(bill.lines.map((l) => l.name)).toEqual(['Test Rum', 'Test Prawns'])
    expect(bill.lines[0]).toMatchObject({ variant: '60ml', qty: 2, amountPaise: 26_000, liquor: true })
    expect(bill.lines[1]).toMatchObject({ note: 'extra spicy', roundNo: 2, liquor: false })
    expect(bill.voided.map((l) => l.name)).toEqual(['Test Cafreal'])

    expect(bill.rows.map((r) => r.label)).toEqual(['Subtotal', 'Discount (10%)', 'Total'])
    expect(bill.rows[1]!.amountPaise).toBe(-7_100)
    expect(bill.subtotalPaise).toBe(71_000)
    expect(bill.totalPaise).toBe(63_900)
    expect(bill.totalLabel).toBe('Rs 639')
    expect(bill.billUrl).toBe(`http://localhost:5173/bill/${detail.order.billToken}`)
    expect(bill.upi?.payUrl).toContain('am=639.00')
    expect(bill.upi?.payUrl).toContain('pa=lurethapollys%40upi')

    const text = whatsappText(bill)
    expect(text).toContain('*Luretha & Pollys Bar & Restaurant*')
    expect(text).toContain('Table Test 2')
    expect(text).toContain('2 x Test Rum (60ml) - 260')
    expect(text).toContain('Discount (10%): -71')
    expect(text).toContain('*Total: Rs 639*')
    expect(text).toContain('Paid by UPI')
    expect(text).toContain(`Full bill: http://localhost:5173/bill/${detail.order.billToken}`)
    // A voided line is never shown to the guest.
    expect(text).not.toContain('Test Cafreal')

    await updateSettings({ upiId: null })
  })

  it('shows a takeaway as takeaway, and offers no UPI link without a UPI id', async () => {
    const order = await withItems(dish(1))
    await settleOrder(order.id, { paymentMode: 'cash' }, f.owner)
    const bill = buildBill(await getOrderDetail(order.id), await getSettings())

    expect(bill.order.tableLabel).toBeNull()
    expect(bill.upi).toBeNull()
    expect(whatsappText(bill)).toContain('Takeaway')
    expect(whatsappText(bill)).toContain('Paid by Cash')
  })

  it('names the tax lines once the owner turns tax on', async () => {
    await updateSettings({ taxEnabled: true, foodTaxBps: 500, liquorTaxBps: 2_000 })
    const order = await withItems(dish(1), peg(1))
    await settleOrder(order.id, { paymentMode: 'cash' }, f.owner)
    const bill = buildBill(await getOrderDetail(order.id), await getSettings())
    expect(bill.rows.map((r) => r.label)).toEqual(['Subtotal', 'GST 5%', 'VAT 20%', 'Total'])
    expect(bill.totalPaise).toBe(DISH_PAISE + LARGE_POUR_PAISE + 3_500)
  })
})

describe('settings row', () => {
  it('creates itself on a fresh database', async () => {
    const rows = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.businessDayStartHour).toBe(6)
  })
})
