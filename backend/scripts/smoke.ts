/**
 * End-to-end HTTP smoke test against a running API.
 *
 *   npm run dev      # terminal 1
 *   npm run smoke    # terminal 2
 *
 * Real fetch over real TCP on purpose. An in-process test cannot see a port that
 * another process has hijacked, which is exactly the failure this project hit on
 * Windows, so the one check that matters most is "does it answer on the wire".
 *
 * Safe to re-run: it cancels whatever it left on the test table and works on a
 * table of its own ("Smoke"), never on the real floor plan.
 */

import { env } from '../src/env'

const BASE = (process.env.SMOKE_BASE_URL ?? `http://localhost:${env.port}`).replace(/\/+$/, '')

type Res = { status: number; body: any; text: string }

/** Minimal cookie jar: one per signed-in actor, so sessions cannot leak. */
class Client {
  private cookies = new Map<string, string>()

  constructor(readonly who: string) {}

  private store(res: Response): void {
    const raw =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [res.headers.get('set-cookie')].filter((v): v is string => Boolean(v))
    for (const line of raw) {
      const [pair] = line.split(';')
      const index = pair?.indexOf('=') ?? -1
      if (index > 0 && pair) this.cookies.set(pair.slice(0, index), pair.slice(index + 1))
    }
  }

  async req(method: string, path: string, body?: unknown): Promise<Res> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    }

    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    this.store(res)

    const text = await res.text()
    let parsed: any = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = null
    }
    return { status: res.status, body: parsed, text }
  }

  get = (path: string) => this.req('GET', path)
  post = (path: string, body?: unknown) => this.req('POST', path, body)
  patch = (path: string, body?: unknown) => this.req('PATCH', path, body)
  del = (path: string) => this.req('DELETE', path)
}

let checks = 0
const failures: string[] = []

function ok(label: string, condition: boolean, detail?: unknown): boolean {
  checks += 1
  if (condition) {
    console.log(`  ok    ${label}`)
    return true
  }
  const extra = detail === undefined ? '' : ` -> ${JSON.stringify(detail).slice(0, 300)}`
  console.log(`  FAIL  ${label}${extra}`)
  failures.push(label)
  return false
}

function is(label: string, actual: unknown, expected: unknown): boolean {
  return ok(`${label} = ${JSON.stringify(expected)}`, actual === expected, { actual })
}

/** Status plus the API's own message, which is what the waiter would have seen. */
function status(label: string, res: Res, expected: number): boolean {
  return ok(`${label} -> ${expected}`, res.status === expected, {
    got: res.status,
    body: res.body?.error ?? res.body,
  })
}

/** Errors come back as { error: { code, message } }; the message is the staff-facing text. */
function message(res: Res): string {
  const error = res.body?.error
  if (typeof error === 'string') return error
  return String(error?.message ?? '')
}

const inrWhole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const inrPaise = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Console-friendly, always two decimals. The bill's own wording comes from formatRupees. */
function rupees(paise: number): string {
  return `Rs ${(paise / 100).toFixed(2)}`
}

/** Mirrors formatPaise: "1,234" for whole rupees, "1,234.50" otherwise. */
function asBilled(paise: number): string {
  const abs = Math.abs(paise)
  return `Rs ${abs % 100 === 0 ? inrWhole.format(paise / 100) : inrPaise.format(paise / 100)}`
}

function section(title: string): void {
  console.log(`\n${title}`)
}

function fail(message: string): never {
  console.error(`\nsmoke: ${message}`)
  process.exit(1)
}

type Variant = { id: number; label: string; pricePaise: number | null; needsPrice: boolean }
type Item = {
  id: number
  name: string
  priceMode: 'fixed' | 'variant' | 'ask'
  basePricePaise: number | null
  available: boolean
  servingNow: boolean
  windowLabel: string | null
  needsPrice: boolean
  variants: Variant[]
}
type Category = { id: number; name: string; group: string; note: string | null; items: Item[] }

type Found = { item: Item; variant: Variant | null; category: string }

/**
 * Finders rather than hard-coded ids: the owner will edit this menu, and a smoke
 * test that breaks when a price is corrected is a smoke test nobody runs.
 */
function findAll(menu: Category[], match: (item: Item, category: Category) => boolean): Found[] {
  const out: Found[] = []
  for (const category of menu) {
    for (const item of category.items) {
      if (match(item, category)) out.push({ item, variant: null, category: category.name })
    }
  }
  return out
}

function prefer(found: Found[], name: string): Found | null {
  const wanted = found.find((f) => f.item.name.toLowerCase().includes(name.toLowerCase()))
  return wanted ?? found[0] ?? null
}

const anon = new Client('anon')
const owner = new Client('owner')
const waiter = new Client('waiter')
const other = new Client('waiter2')

const SMOKE_TABLE = 'Smoke'
const SMOKE_WAITER = 'Smoke Waiter'
const SMOKE_PIN = '4731'

async function health(): Promise<void> {
  section('health')
  const res = await anon.get('/api/health')
  status('GET /api/health', res, 200)
  is('ok', res.body?.ok, true)
  ok(`database = ${res.body?.database}`, typeof res.body?.database === 'string', res.body)
  console.log(`        base url ${BASE}`)
}

async function signIn(): Promise<{ ownerId: number; waiterId: number }> {
  section('auth')

  const signedOut = await anon.get('/api/auth/me')
  status('GET /api/auth/me signed out', signedOut, 200)
  is('user', signedOut.body?.user, null)

  const list = await anon.get('/api/auth/staff')
  status('GET /api/auth/staff (public PIN screen)', list, 200)
  const staff: { id: number; name: string; role: string }[] = list.body?.staff ?? []
  ok('PIN screen lists at least one waiter', staff.some((s) => s.role === 'waiter'), staff)
  ok('PIN screen leaks no hashes', !list.text.includes('Hash'), list.text.slice(0, 200))

  const seedWaiter = staff.find((s) => s.name === env.seed.waiterName) ?? staff[0]
  if (!seedWaiter) fail('no staff to sign in as - run npm run db:seed first')

  const wrongPin = await anon.post('/api/auth/pin', { staffId: seedWaiter.id, pin: '0000' })
  status('POST /api/auth/pin with a wrong PIN', wrongPin, 401)

  const pinRes = await waiter.post('/api/auth/pin', {
    staffId: seedWaiter.id,
    pin: env.seed.waiterPin,
  })
  status('POST /api/auth/pin', pinRes, 200)
  is('waiter role', pinRes.body?.user?.role, 'waiter')

  const wrongPassword = await anon.post('/api/auth/owner', {
    email: env.seed.ownerEmail,
    password: 'definitely-not-it',
  })
  status('POST /api/auth/owner with a wrong password', wrongPassword, 401)

  const ownerRes = await owner.post('/api/auth/owner', {
    email: env.seed.ownerEmail,
    password: env.seed.ownerPassword,
  })
  status('POST /api/auth/owner', ownerRes, 200)
  is('owner role', ownerRes.body?.user?.role, 'owner')

  const guarded = await anon.get('/api/orders/running')
  status('GET /api/orders/running without a session', guarded, 401)

  const waiterId: number = pinRes.body?.user?.id
  const ownerId: number = ownerRes.body?.user?.id
  if (!waiterId || !ownerId) fail('login did not return user ids')
  return { ownerId, waiterId }
}

type Picks = { peg: Found; dish: Found; ask: Found; gated: Found | null }

async function readMenu(): Promise<Picks> {
  section('menu')
  const res = await waiter.get('/api/menu')
  status('GET /api/menu as waiter', res, 200)
  const menu: Category[] = res.body?.menu ?? []

  const items = menu.flatMap((c) => c.items)
  const variants = items.flatMap((i) => i.variants)
  ok(`${menu.length} sections, ${items.length} items, ${variants.length} sizes`, items.length > 300, {
    sections: menu.length,
    items: items.length,
  })

  const askRows = findAll(menu, (item) => item.priceMode === 'ask')
  ok(`${askRows.length} ask-for-price items`, askRows.length >= 11, askRows.length)

  const pegs = findAll(
    menu,
    (item, category) =>
      category.group === 'bar' && item.variants.some((v) => v.label === '60ml' && v.pricePaise),
  )
  const peg = prefer(pegs, 'Old Monk')
  const dish = prefer(
    findAll(menu, (i, c) => c.group === 'food' && i.priceMode === 'fixed' && !!i.basePricePaise),
    'Cafreal',
  )
  const ask = prefer(askRows, 'Prawns')
  const gated = prefer(findAll(menu, (item) => item.windowLabel !== null), 'Beef Steak')

  if (!peg || !dish || !ask) fail('the seeded menu is missing a peg, a dish or an ask-price item')
  peg.variant = peg.item.variants.find((v) => v.label === '60ml') ?? null
  if (!peg.variant) fail('no 60ml size on the chosen spirit')

  console.log(`        peg   ${peg.item.name} 60ml  ${rupees(peg.variant.pricePaise ?? 0)}`)
  console.log(`        dish  ${dish.item.name}  ${rupees(dish.item.basePricePaise ?? 0)}`)
  console.log(`        ask   ${ask.item.name} (${ask.category})`)
  if (gated) console.log(`        gated ${gated.item.name}  ${gated.item.windowLabel}`)

  const sheet = await waiter.get('/api/menu/verification-sheet')
  status('GET /api/menu/verification-sheet as waiter', sheet, 403)

  return { peg, dish, ask, gated }
}

/** A table and a second waiter that belong to the test, so reruns stay clean. */
async function prepare(): Promise<{ tableId: number; otherId: number }> {
  section('floor and staff setup')

  const floor = await waiter.get('/api/tables/floor')
  status('GET /api/tables/floor as waiter', floor, 200)
  const tables: { id: number; label: string; order: { id: number } | null }[] = floor.body?.tables ?? []
  ok(`${tables.length} tables on the floor`, tables.length >= 16, tables.length)

  let table = tables.find((t) => t.label === SMOKE_TABLE)
  if (!table) {
    const created = await owner.post('/api/tables', { label: SMOKE_TABLE, section: 'indoor', seats: 2, sort: 900 })
    status(`POST /api/tables "${SMOKE_TABLE}"`, created, 201)
    table = { id: created.body?.table?.id, label: SMOKE_TABLE, order: null }
  } else if (table.order) {
    // Left behind by an interrupted run.
    const cleared = await owner.post(`/api/orders/${table.order.id}/void`, { reason: 'smoke test cleanup' })
    status('POST /api/orders/:id/void (leftover tab)', cleared, 200)
  }
  if (!table?.id) fail(`could not get a "${SMOKE_TABLE}" table`)

  const list = await owner.get('/api/staff')
  status('GET /api/staff as owner', list, 200)
  const roster: { id: number; name: string }[] = list.body?.staff ?? []
  let otherId = roster.find((s) => s.name === SMOKE_WAITER)?.id ?? 0

  if (!otherId) {
    const created = await owner.post('/api/staff', { name: SMOKE_WAITER, role: 'waiter', pin: SMOKE_PIN })
    status(`POST /api/staff "${SMOKE_WAITER}"`, created, 201)
    otherId = created.body?.member?.id
  } else {
    status('POST /api/staff/:id/pin', await owner.post(`/api/staff/${otherId}/pin`, { pin: SMOKE_PIN }), 200)
    status('POST /api/staff/:id/unlock', await owner.post(`/api/staff/${otherId}/unlock`), 200)
  }
  if (!otherId) fail('could not create the second waiter')

  const login = await other.post('/api/auth/pin', { staffId: otherId, pin: SMOKE_PIN })
  status('POST /api/auth/pin as the second waiter', login, 200)

  const denied = await waiter.get('/api/staff')
  status('GET /api/staff as waiter', denied, 403)

  return { tableId: table.id, otherId }
}

const ASK_PRICE_PAISE = 45_000 // Rs 450, what the counter would quote for prawns

type Tab = {
  orderId: number
  orderNo: number
  subtotalPaise: number
  pegPrice: number
  dishPrice: number
}

async function takeOrder(picks: Picks, tableId: number): Promise<Tab> {
  section('waiter takes the order')

  const opened = await waiter.post('/api/orders', {
    orderType: 'dine_in',
    diningTableId: tableId,
    guests: 2,
  })
  status('POST /api/orders', opened, 201)
  const orderId: number = opened.body?.order?.id
  const orderNo: number = opened.body?.order?.orderNo
  if (!orderId) fail('order was not created')
  ok(`order #${orderNo} opened on the test table`, Number.isInteger(orderNo), opened.body?.order)

  const twice = await waiter.post('/api/orders', { orderType: 'dine_in', diningTableId: tableId })
  status('POST /api/orders on a table that is already running', twice, 409)

  const pegPrice = picks.peg.variant?.pricePaise ?? 0
  const dishPrice = picks.dish.item.basePricePaise ?? 0

  const round1 = await waiter.post(`/api/orders/${orderId}/items`, {
    items: [
      { menuItemId: picks.peg.item.id, variantId: picks.peg.variant?.id, qty: 2 },
      { menuItemId: picks.dish.item.id, qty: 1, note: 'extra spicy' },
    ],
  })
  status('POST /api/orders/:id/items round 1 (peg + dish)', round1, 201)
  is('roundNo', round1.body?.roundNo, 1)
  is('subtotal after round 1', round1.body?.order?.subtotalPaise, pegPrice * 2 + dishPrice)

  const noPrice = await waiter.post(`/api/orders/${orderId}/items`, {
    items: [{ menuItemId: picks.ask.item.id, qty: 1 }],
  })
  status('POST an ask-price item with no price', noPrice, 400)
  ok('the message names the item', message(noPrice).includes(picks.ask.item.name), message(noPrice))

  const round2 = await waiter.post(`/api/orders/${orderId}/items`, {
    items: [{ menuItemId: picks.ask.item.id, qty: 1, unitPricePaise: ASK_PRICE_PAISE }],
  })
  status('POST /api/orders/:id/items round 2 (ask-price seafood)', round2, 201)
  is('roundNo', round2.body?.roundNo, 2)

  const subtotalPaise = pegPrice * 2 + dishPrice + ASK_PRICE_PAISE
  is('subtotal after round 2', round2.body?.order?.subtotalPaise, subtotalPaise)
  console.log(`        running tab ${rupees(subtotalPaise)}`)

  return { orderId, orderNo, subtotalPaise, pegPrice, dishPrice }
}

/** The 7pm-10pm steaks: the gate has to hold on the server, not just grey out a tile. */
async function checkTimeGate(picks: Picks, orderId: number): Promise<void> {
  section('time-gated items')
  if (!picks.gated) {
    console.log('  skip  no time-gated item in the menu')
    return
  }
  const res = await waiter.post(`/api/orders/${orderId}/items`, {
    items: [{ menuItemId: picks.gated.item.id, qty: 1 }],
  })
  if (picks.gated.item.servingNow) {
    status(`POST ${picks.gated.item.name} inside its window`, res, 201)
    const lines: { id: number; name: string }[] = []
    const detail = await waiter.get(`/api/orders/${orderId}`)
    for (const line of detail.body?.bill?.lines ?? []) {
      if (line.name === picks.gated.item.name) lines.push(line)
    }
    for (const line of lines) {
      await waiter.post(`/api/orders/${orderId}/items/${line.id}/void`, { reason: 'smoke test gate' })
    }
    ok('the gated line was removed again', lines.length > 0, lines)
  } else {
    status(`POST ${picks.gated.item.name} outside its window`, res, 409)
    ok('the message says when it is served', /served .* only/i.test(message(res)), message(res))
  }
}

async function readTab(tab: Tab): Promise<number> {
  section('tab and kitchen view')

  const detail = await waiter.get(`/api/orders/${tab.orderId}`)
  status('GET /api/orders/:id as the waiter who owns it', detail, 200)
  const lines: { id: number; name: string; qty: number; roundNo: number; note: string | null }[] =
    detail.body?.bill?.lines ?? []
  is('three live lines', lines.length, 3)
  is('two rounds', new Set(lines.map((l) => l.roundNo)).size, 2)
  ok('the kitchen note survived', lines.some((l) => l.note === 'extra spicy'), lines)
  is('bill total matches the tab', detail.body?.bill?.totalPaise, tab.subtotalPaise)
  ok('no bill link before the bill is printed', detail.body?.bill?.billUrl === null, detail.body?.bill?.billUrl)

  const tickets = await waiter.get('/api/orders/kitchen')
  status('GET /api/orders/kitchen', tickets, 200)
  const mine = (tickets.body?.tickets ?? []).filter((t: any) => t.orderId === tab.orderId)
  is('two tickets for this order, one per round', mine.length, 2)

  const bar = await waiter.get('/api/orders/kitchen?group=bar')
  const barLines = (bar.body?.tickets ?? [])
    .filter((t: any) => t.orderId === tab.orderId)
    .flatMap((t: any) => t.lines)
  ok('the bar view shows only bar lines', barLines.every((l: any) => l.group === 'bar'), barLines)

  const first = lines[0]
  if (!first) fail('no lines to serve')
  status('POST /api/orders/:id/items/:itemId/served', await waiter.post(`/api/orders/${tab.orderId}/items/${first.id}/served`), 200)
  status('POST served twice', await waiter.post(`/api/orders/${tab.orderId}/items/${first.id}/served`), 404)

  const dish = lines.find((l) => l.note === 'extra spicy') ?? lines[1]
  if (!dish) fail('could not find the dish line to void later')
  return dish.id
}

/** This API is on the public internet, so every guard is checked over the wire. */
async function authorisation(tab: Tab, picks: Picks): Promise<void> {
  section('authorisation')

  status('GET another waiter\'s order', await other.get(`/api/orders/${tab.orderId}`), 403)
  status(
    'add items to another waiter\'s order',
    await other.post(`/api/orders/${tab.orderId}/items`, {
      items: [{ menuItemId: picks.dish.item.id, qty: 1 }],
    }),
    403,
  )

  const theirs = await other.get('/api/orders/running')
  status('GET /api/orders/running as the other waiter', theirs, 200)
  ok(
    'the other waiter does not see this tab',
    !(theirs.body?.orders ?? []).some((o: any) => o.id === tab.orderId),
    theirs.body?.orders,
  )

  status('waiter applies a discount', await waiter.post(`/api/orders/${tab.orderId}/discount`, { discountType: 'percent', discountValue: 5000 }), 403)
  status('waiter settles the bill', await waiter.post(`/api/orders/${tab.orderId}/settle`, { paymentMode: 'cash' }), 403)
  status('waiter cancels the order', await waiter.post(`/api/orders/${tab.orderId}/void`, { reason: 'not allowed' }), 403)
  status('waiter moves the table', await waiter.post(`/api/orders/${tab.orderId}/table`, { diningTableId: 1 }), 403)
  status('waiter reads the reports', await waiter.get('/api/reports/summary'), 403)
  status('waiter reads the audit log', await waiter.get('/api/reports/audit'), 403)
  status('waiter edits a menu price', await waiter.patch(`/api/menu/items/${picks.dish.item.id}`, { basePricePaise: 100 }), 403)
  status('waiter edits the settings', await waiter.patch('/api/settings', { taxEnabled: true }), 403)
  status('waiter adds a table', await waiter.post('/api/tables', { label: 'Nope' }), 403)
  status('signed out request for the order', await anon.get(`/api/orders/${tab.orderId}`), 401)

  // A waiter must still be able to read the card and their own floor.
  status('waiter reads the menu', await waiter.get('/api/menu'), 200)
  status('waiter reads the settings header', await waiter.get('/api/settings'), 200)
  const header = await waiter.get('/api/settings')
  ok('SMTP details stay with the owner', header.body?.mail === undefined, header.body?.mail)
  const ownerView = await owner.get('/api/settings')
  ok('the owner does see the mail status', ownerView.body?.mail !== undefined, ownerView.body?.mail)

  const foreign = await fetch(`${BASE}/api/health`, { headers: { origin: 'https://evil.example' } })
  ok(
    'CORS does not echo an unknown origin',
    foreign.headers.get('access-control-allow-origin') === null,
    foreign.headers.get('access-control-allow-origin'),
  )
}

const DISCOUNT_BPS = 1_000 // 10%

type Settled = { totalPaise: number; token: string }

async function ownerFlow(tab: Tab, dishLineId: number, picks: Picks): Promise<Settled> {
  section('owner board, void, discount, settle')

  const board = await owner.get('/api/orders/running')
  status('GET /api/orders/running as owner', board, 200)
  ok('the live board carries this tab', (board.body?.orders ?? []).some((o: any) => o.id === tab.orderId), board.body?.orders?.length)

  const noReason = await owner.post(`/api/orders/${tab.orderId}/items/${dishLineId}/void`, { reason: 'x' })
  status('void with a one-character reason', noReason, 400)

  const voided = await owner.post(`/api/orders/${tab.orderId}/items/${dishLineId}/void`, {
    reason: 'guest changed their mind',
  })
  status('POST /api/orders/:id/items/:itemId/void', voided, 200)
  const afterVoid = tab.subtotalPaise - tab.dishPrice
  is('subtotal after the void', voided.body?.order?.subtotalPaise, afterVoid)
  status('voiding the same line twice', await owner.post(`/api/orders/${tab.orderId}/items/${dishLineId}/void`, { reason: 'again' }), 409)

  const tooMuch = await owner.post(`/api/orders/${tab.orderId}/discount`, { discountType: 'percent', discountValue: 20_000 })
  status('a 200% discount', tooMuch, 400)

  const discounted = await owner.post(`/api/orders/${tab.orderId}/discount`, {
    discountType: 'percent',
    discountValue: DISCOUNT_BPS,
  })
  status('POST /api/orders/:id/discount 10%', discounted, 200)
  is('discount is 10% of the subtotal', discounted.body?.order?.discountPaise, Math.round((afterVoid * DISCOUNT_BPS) / 10_000))

  const printed = await waiter.post(`/api/orders/${tab.orderId}/bill`)
  status('POST /api/orders/:id/bill as the waiter', printed, 200)
  is('status', printed.body?.order?.status, 'billed')
  const token: string = printed.body?.order?.billToken
  ok('the bill got a public token', typeof token === 'string' && token.length >= 20, token)
  ok('the bill carries its public link', String(printed.body?.bill?.billUrl ?? '').endsWith(token), printed.body?.bill?.billUrl)

  // One more round after the bill was printed: the tab must reopen, not silently
  // carry a line the printed bill never showed.
  const extra = await waiter.post(`/api/orders/${tab.orderId}/items`, {
    items: [{ menuItemId: picks.peg.item.id, variantId: picks.peg.variant?.id, qty: 1 }],
  })
  status('POST one more round after the bill', extra, 201)
  is('the order reopened', extra.body?.order?.status, 'open')

  const finalSubtotal = afterVoid + tab.pegPrice
  is('subtotal with the last round', extra.body?.order?.subtotalPaise, finalSubtotal)

  const reprinted = await waiter.post(`/api/orders/${tab.orderId}/bill`)
  status('POST /api/orders/:id/bill again', reprinted, 200)
  is('the public token does not change', reprinted.body?.order?.billToken, token)

  const settled = await owner.post(`/api/orders/${tab.orderId}/settle`, {
    paymentMode: 'upi',
    guestName: 'Smoke Guest',
    guestPhone: '9876543210',
    guestEmail: 'smoke@example.com',
  })
  status('POST /api/orders/:id/settle by UPI', settled, 200)
  is('status', settled.body?.order?.status, 'settled')
  is('payment mode', settled.body?.order?.paymentMode, 'upi')

  const discount = Math.round((finalSubtotal * DISCOUNT_BPS) / 10_000)
  const gross = finalSubtotal - discount
  const expected = Math.round(gross / 100) * 100
  is('total is rounded to whole rupees', settled.body?.order?.totalPaise, expected)
  is('round off is recorded', settled.body?.order?.roundOffPaise, expected - gross)
  ok(`bill ${rupees(finalSubtotal)} - ${rupees(discount)} = ${rupees(expected)}`, expected % 100 === 0, expected)

  status('settling twice', await owner.post(`/api/orders/${tab.orderId}/settle`, { paymentMode: 'cash' }), 409)
  status(
    'adding a round after settle',
    await waiter.post(`/api/orders/${tab.orderId}/items`, { items: [{ menuItemId: picks.dish.item.id, qty: 1 }] }),
    409,
  )

  return { totalPaise: expected, token }
}

async function delivery(tab: Tab, settled: Settled): Promise<void> {
  section('bill delivery')

  const bad = await owner.post(`/api/bills/${tab.orderId}/whatsapp`, { phone: '12345' })
  status('WhatsApp to a nonsense number', bad, 400)

  const wa = await owner.post(`/api/bills/${tab.orderId}/whatsapp`, { phone: '098765 43210' })
  status('POST /api/bills/:id/whatsapp', wa, 200)
  const link: string = wa.body?.delivery?.link ?? ''
  ok('the link is a wa.me hand-off with +91 filled in', link.startsWith('https://wa.me/919876543210?text='), link.slice(0, 60))
  is('status', wa.body?.delivery?.status, 'opened')

  const text: string = wa.body?.delivery?.text ?? ''
  ok('the message names the restaurant', text.includes('Luretha'), text.slice(0, 60))
  ok(
    'the message carries the total',
    text.includes(`Total: ${asBilled(settled.totalPaise)}`),
    { want: `Total: ${asBilled(settled.totalPaise)}`, tail: text.slice(-200) },
  )
  ok('the message carries the bill link', text.includes(settled.token), text.slice(-200))
  ok('voided lines are not in the message', !text.includes('extra spicy'), text)

  const mail = await owner.post(`/api/bills/${tab.orderId}/email`, { email: 'guest@example.com' })
  if (mail.status === 200) {
    is('email sent', mail.body?.delivery?.status, 'sent')
  } else {
    // SMTP_HOST empty is the documented default: WhatsApp and the link still work.
    status('POST /api/bills/:id/email with no SMTP configured', mail, 400)
    ok('the error explains why', /mail|smtp|configur/i.test(message(mail)), message(mail))
  }

  const log = await owner.get(`/api/bills/${tab.orderId}/deliveries`)
  status('GET /api/bills/:id/deliveries', log, 200)
  const rows: { channel: string; status: string; target: string }[] = log.body?.deliveries ?? []
  ok('the WhatsApp hand-off is logged', rows.some((r) => r.channel === 'whatsapp' && r.target === '919876543210'), rows)
  ok('the email attempt is logged too', rows.some((r) => r.channel === 'email'), rows)

  section('public bill page and UPI')

  const publicBill = await anon.get(`/api/bills/public/${settled.token}`)
  status('GET /api/bills/public/:token with no login', publicBill, 200)
  is('the public total matches', publicBill.body?.bill?.totalPaise, settled.totalPaise)
  is('the guest phone is not published', publicBill.body?.bill?.order?.guestPhone, null)
  is('the guest email is not published', publicBill.body?.bill?.order?.guestEmail, null)
  ok('the voided line is listed separately', (publicBill.body?.bill?.voided ?? []).length >= 1, publicBill.body?.bill?.voided)
  status('GET /api/bills/public/:token with a made-up token', await anon.get('/api/bills/public/not-a-real-token'), 404)

  const before = await owner.get('/api/settings')
  const originalUpi: string | null = before.body?.settings?.upiId ?? null

  const noUpi = originalUpi ? null : await owner.get(`/api/bills/${tab.orderId}/upi-qr`)
  if (noUpi) status('GET /api/bills/:id/upi-qr before a UPI id is set', noUpi, 409)

  status('PATCH /api/settings upiId', await owner.patch('/api/settings', { upiId: originalUpi ?? 'lurethapollys@upi' }), 200)
  const qr = await owner.get(`/api/bills/${tab.orderId}/upi-qr`)
  status('GET /api/bills/:id/upi-qr', qr, 200)
  ok('the QR is a PNG data url', String(qr.body?.dataUrl ?? '').startsWith('data:image/png;base64,'), String(qr.body?.dataUrl).slice(0, 40))
  ok('the pay url carries the amount', String(qr.body?.payUrl ?? '').includes(`am=${(settled.totalPaise / 100).toFixed(2)}`), qr.body?.payUrl)

  // Leave the settings row exactly as it was found.
  if (!originalUpi) {
    status('PATCH /api/settings upiId back to empty', await owner.patch('/api/settings', { upiId: '' }), 200)
  }
}

async function reports(tab: Tab, settled: Settled): Promise<void> {
  section('reports')

  const day = await owner.get('/api/reports/day-sheet')
  status('GET /api/reports/day-sheet', day, 200)
  const sheet = day.body?.sheet
  ok('at least one settled order today', (sheet?.orders ?? 0) >= 1, sheet?.orders)
  ok('the UPI column carries this bill', (sheet?.upi?.paise ?? 0) >= settled.totalPaise, sheet?.upi)
  ok('the void is on the sheet', (sheet?.voids?.lines ?? 0) >= 1, sheet?.voids)
  ok('food and liquor are split', (sheet?.liquorPaise ?? 0) > 0 && (sheet?.foodPaise ?? 0) > 0, {
    food: sheet?.foodPaise,
    liquor: sheet?.liquorPaise,
  })
  console.log(`        day sheet: ${sheet?.orders} orders, net ${rupees(sheet?.netPaise ?? 0)}`)

  const summary = await owner.get('/api/reports/summary')
  status('GET /api/reports/summary', summary, 200)
  for (const key of ['sheet', 'daily', 'categories', 'waiters', 'hours', 'topItems']) {
    ok(`summary carries ${key}`, summary.body?.[key] !== undefined, Object.keys(summary.body ?? {}))
  }
  const hours: { hour: number; label: string }[] = summary.body?.hours ?? []
  ok(
    `${hours.length} hourly buckets, ascending`,
    hours.length >= 17 && hours.every((row, i) => i === 0 || row.hour > (hours[i - 1]?.hour ?? -1)),
    hours.map((h) => h.hour),
  )

  const items = await owner.get('/api/reports/items')
  status('GET /api/reports/items', items, 200)
  ok('the ask-price line is reported at the price the waiter keyed in',
    (items.body?.items ?? []).some((row: any) => row.amountPaise >= ASK_PRICE_PAISE),
    (items.body?.items ?? []).slice(0, 3))

  const orderRows = await owner.get('/api/reports/orders')
  status('GET /api/reports/orders', orderRows, 200)
  const mine = (orderRows.body?.orders ?? []).find((row: any) => row.orderNo === tab.orderNo)
  ok('this bill is in the settled list', Boolean(mine), (orderRows.body?.orders ?? []).slice(0, 3))
  if (mine) is('the reported total matches the bill', mine.totalPaise, settled.totalPaise)

  for (const type of ['orders', 'items', 'daily', 'categories', 'waiters', 'hours']) {
    const csv = await owner.get(`/api/reports/export?type=${type}`)
    ok(`CSV export of ${type}`, csv.status === 200 && csv.text.includes(','), { status: csv.status })
  }
  const csvOrders = await owner.get('/api/reports/export?type=orders')
  ok('the CSV is sent as an attachment', csvOrders.text.split('\n')[0]?.includes('Order no'), csvOrders.text.slice(0, 80))
  ok('this order number is in the CSV', csvOrders.text.includes(`,${tab.orderNo},`), csvOrders.text.slice(0, 200))

  const audit = await owner.get('/api/reports/audit?limit=100')
  status('GET /api/reports/audit', audit, 200)
  const actions = new Set((audit.body?.entries ?? []).map((row: any) => row.action))
  for (const action of ['order_item.ask_price', 'order_item.void', 'order.discount', 'order.settle']) {
    ok(`audit log records ${action}`, actions.has(action), [...actions])
  }
}

/** The other half of the floor: no table, paid in cash. */
async function takeaway(picks: Picks, previousOrderNo: number): Promise<void> {
  section('takeaway paid in cash')

  const noTable = await waiter.post('/api/orders', { orderType: 'dine_in' })
  status('POST /api/orders dine-in with no table', noTable, 400)

  const opened = await waiter.post('/api/orders', { orderType: 'takeaway', guestName: 'Walk-in' })
  status('POST /api/orders takeaway', opened, 201)
  const orderId: number = opened.body?.order?.id
  if (!orderId) fail('takeaway order was not created')
  is('the order number went up by one', opened.body?.order?.orderNo, previousOrderNo + 1)
  ok(
    `business date ${opened.body?.order?.businessDate} (IST, rolls at 6am)`,
    /^\d{4}-\d{2}-\d{2}$/.test(String(opened.body?.order?.businessDate)),
    opened.body?.order?.businessDate,
  )

  const added = await waiter.post(`/api/orders/${orderId}/items`, {
    items: [{ menuItemId: picks.dish.item.id, qty: 3 }],
  })
  status('POST /api/orders/:id/items', added, 201)
  is('subtotal', added.body?.order?.subtotalPaise, (picks.dish.item.basePricePaise ?? 0) * 3)

  const settled = await owner.post(`/api/orders/${orderId}/settle`, { paymentMode: 'cash' })
  status('POST /api/orders/:id/settle by cash', settled, 200)
  is('payment mode', settled.body?.order?.paymentMode, 'cash')
  ok('takeaway has no table', settled.body?.order?.diningTableId === null, settled.body?.order?.diningTableId)

  const empty = await waiter.post('/api/orders', { orderType: 'takeaway' })
  const emptyId: number = empty.body?.order?.id
  if (!emptyId) fail('could not open an empty order')
  status('settling an order with no items', await owner.post(`/api/orders/${emptyId}/settle`, { paymentMode: 'cash' }), 409)
  status('cancelling it instead', await owner.post(`/api/orders/${emptyId}/void`, { reason: 'opened by mistake' }), 200)
}

async function signOut(): Promise<void> {
  section('sign out')
  status('POST /api/auth/logout', await waiter.post('/api/auth/logout'), 200)
  status('the waiter session is gone', await waiter.get('/api/orders/running'), 401)
  status('POST /api/auth/logout (owner)', await owner.post('/api/auth/logout'), 200)
  await other.post('/api/auth/logout')
}

async function main(): Promise<void> {
  console.log(`Smoke test against ${BASE}`)

  await health()
  await signIn()
  const picks = await readMenu()
  const { tableId } = await prepare()
  const tab = await takeOrder(picks, tableId)
  await checkTimeGate(picks, tab.orderId)
  const dishLineId = await readTab(tab)
  await authorisation(tab, picks)
  const settled = await ownerFlow(tab, dishLineId, picks)
  await delivery(tab, settled)
  await takeaway(picks, tab.orderNo)
  await reports(tab, settled)
  await signOut()

  console.log(`\n${checks - failures.length}/${checks} checks passed`)
  if (failures.length > 0) {
    console.log('\nfailed:')
    for (const label of failures) console.log(`  - ${label}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('\nsmoke test could not run:', error instanceof Error ? error.message : error)
  console.error('Is the API running?  npm run dev')
  process.exit(1)
})
