/**
 * Hand-written mirror of the API's response shapes.
 *
 * Two things differ from the backend's own types and are easy to trip over:
 * every `Date` arrives as an ISO string over JSON, and Postgres `date` columns
 * (business dates) are already plain 'YYYY-MM-DD' strings on both sides.
 */

export type Role = 'owner' | 'waiter'
export type MenuGroup = 'breakfast' | 'food' | 'bar' | 'beverage' | 'dessert'
export type PriceMode = 'fixed' | 'variant' | 'ask'
export type Section = 'indoor' | 'garden' | 'beach'
export type OrderType = 'dine_in' | 'takeaway'
export type OrderStatus = 'open' | 'billed' | 'settled' | 'void'
export type OrderItemStatus = 'placed' | 'served' | 'void'
export type PaymentMode = 'cash' | 'upi'
export type DiscountType = 'none' | 'amount' | 'percent'

export type User = { id: number; name: string; role: Role }

export type LoginStaff = { id: number; name: string; role: Role }

export type Settings = {
  id: number
  restaurantName: string
  tagline: string | null
  address: string | null
  phonePrimary: string | null
  phoneSecondary: string | null
  instagram: string | null
  upiId: string | null
  upiPayeeName: string | null
  reviewUrl: string | null
  billFooter: string | null
  taxEnabled: boolean
  foodTaxBps: number
  liquorTaxBps: number
  serviceChargeBps: number
  businessDayStartHour: number
  updatedAt: string
}

export type MailStatus = { configured: boolean; from?: string | null; host?: string | null }

export type MenuVariant = {
  id: number
  label: string
  pricePaise: number | null
  needsPrice: boolean
}

export type MenuItem = {
  id: number
  categoryId: number
  name: string
  description: string | null
  priceMode: PriceMode
  basePricePaise: number | null
  isVeg: boolean | null
  available: boolean
  /** False when the item is outside its serving window right now. */
  servingNow: boolean
  windowLabel: string | null
  needsPrice: boolean
  note: string | null
  sort: number
  variants: MenuVariant[]
}

export type MenuCategory = {
  id: number
  name: string
  group: MenuGroup
  note: string | null
  sort: number
  items: MenuItem[]
}

export type OrderSummary = {
  id: number
  orderNo: number
  businessDate: string
  status: OrderStatus
  orderType: OrderType
  diningTableId: number | null
  tableLabel: string | null
  tableSection: string | null
  waiterId: number
  waiterName: string
  guestName: string | null
  subtotalPaise: number
  totalPaise: number
  paymentMode: PaymentMode | null
  itemCount: number
  openedAt: string
  lastItemAt: string | null
  settledAt: string | null
}

export type FloorTable = {
  id: number
  label: string
  section: Section
  seats: number
  sort: number
  order: OrderSummary | null
}

export type DiningTable = {
  id: number
  label: string
  section: Section
  seats: number
  sort: number
  isActive: boolean
}

export type Order = {
  id: number
  orderNo: number
  businessDate: string
  orderType: OrderType
  diningTableId: number | null
  waiterId: number
  status: OrderStatus
  guests: number
  guestName: string | null
  guestPhone: string | null
  guestEmail: string | null
  subtotalPaise: number
  discountType: DiscountType
  discountValue: number
  discountPaise: number
  taxPaise: number
  serviceChargePaise: number
  roundOffPaise: number
  totalPaise: number
  paymentMode: PaymentMode | null
  notes: string | null
  billToken: string | null
  openedAt: string
  lastItemAt: string | null
  billedAt: string | null
  settledAt: string | null
  settledById: number | null
}

export type OrderItem = {
  id: number
  orderId: number
  roundNo: number
  menuItemId: number | null
  variantId: number | null
  nameSnapshot: string
  variantSnapshot: string | null
  categorySnapshot: string
  groupSnapshot: MenuGroup
  unitPricePaise: number
  qty: number
  note: string | null
  status: OrderItemStatus
  createdById: number
  createdAt: string
  servedAt: string | null
  voidedById: number | null
  voidedAt: string | null
  voidReason: string | null
}

export type BillLine = {
  id: number
  name: string
  variant: string | null
  qty: number
  unitPricePaise: number
  amountPaise: number
  note: string | null
  roundNo: number
  liquor: boolean
}

export type BillTotalRow = { label: string; amountPaise: number; strong?: boolean }

export type BillView = {
  restaurant: {
    name: string
    tagline: string | null
    address: string | null
    phone: string | null
    phoneSecondary: string | null
    instagram: string | null
  }
  order: {
    id: number
    orderNo: number
    businessDate: string
    dateLabel: string
    timeLabel: string
    status: string
    orderType: string
    tableLabel: string | null
    waiterName: string
    guests: number
    guestName: string | null
    guestPhone: string | null
    guestEmail: string | null
    paymentMode: string | null
  }
  lines: BillLine[]
  voided: BillLine[]
  rows: BillTotalRow[]
  subtotalPaise: number
  totalPaise: number
  totalLabel: string
  billUrl: string | null
  upi: { id: string; payeeName: string; payUrl: string } | null
  footer: string | null
  reviewUrl: string | null
}

export type OrderDetail = {
  order: Order
  items: OrderItem[]
  tableLabel: string | null
  waiterName: string
  bill: BillView
}

export type KitchenLine = {
  id: number
  name: string
  variant: string | null
  qty: number
  note: string | null
  group: MenuGroup
}

export type KitchenTicket = {
  orderId: number
  orderNo: number
  roundNo: number
  orderType: OrderType
  tableLabel: string | null
  waiterName: string
  placedAt: string
  lines: KitchenLine[]
}

export type StaffMember = {
  id: number
  name: string
  role: Role
  email: string | null
  isActive: boolean
  hasPin: boolean
  hasPassword: boolean
  lockedUntil: string | null
  /** Open or billed tabs still on this waiter: the reason not to deactivate yet. */
  openOrders: number
}

/** What POST /bills/:id/whatsapp and /email answer with. */
export type DeliveryOutcome = {
  channel: 'whatsapp' | 'email'
  target: string
  status: 'opened' | 'sent' | 'failed'
  /** WhatsApp only: the wa.me URL the phone should open. */
  link?: string
  text?: string
  error?: string
}

/** A row of the delivery history behind GET /bills/:id/deliveries. */
export type DeliveryRow = {
  id: number
  orderId: number
  channel: 'whatsapp' | 'email'
  target: string
  status: 'queued' | 'opened' | 'sent' | 'failed'
  error: string | null
  createdAt: string
  sentAt: string | null
}

export type DateRange = { from: string; to: string }

export type DaySheet = {
  range: DateRange
  orders: number
  covers: number
  itemsSold: number
  grossPaise: number
  discountPaise: number
  taxPaise: number
  serviceChargePaise: number
  roundOffPaise: number
  netPaise: number
  averageBillPaise: number
  cash: { orders: number; paise: number }
  upi: { orders: number; paise: number }
  foodPaise: number
  liquorPaise: number
  voids: { lines: number; paise: number }
  /** Tabs still running, so the owner knows the day is not closed yet. */
  open: { orders: number; paise: number }
}

export type DailyRow = {
  businessDate: string
  orders: number
  covers: number
  netPaise: number
  cashPaise: number
  upiPaise: number
}

export type ItemRow = {
  name: string
  variant: string | null
  category: string
  group: string
  qty: number
  amountPaise: number
}

export type CategoryRow = { category: string; group: string; qty: number; amountPaise: number }

export type WaiterRow = {
  waiterId: number
  name: string
  orders: number
  covers: number
  netPaise: number
  averageBillPaise: number
}

export type HourRow = { hour: number; label: string; qty: number; amountPaise: number }

export type SettledOrderRow = {
  id: number
  orderNo: number
  businessDate: string
  table: string | null
  waiter: string
  guests: number
  subtotalPaise: number
  discountPaise: number
  taxPaise: number
  totalPaise: number
  paymentMode: string | null
  settledAt: string | null
}

/** Everything behind the reports screen in one request. */
export type ReportSummary = {
  range: DateRange
  sheet: DaySheet
  daily: DailyRow[]
  categories: CategoryRow[]
  waiters: WaiterRow[]
  hours: HourRow[]
  topItems: ItemRow[]
}

export type AuditRow = {
  id: number
  actorId: number | null
  actorName: string | null
  action: string
  entity: string
  entityId: string | null
  before: unknown
  after: unknown
  createdAt: string
}

/** The owner's price sign-off sheet. `price` is rupees as text, or 'ask'. */
export type VerificationRow = { name: string; detail: string | null; price: string }

export type VerificationSection = {
  category: string
  group: MenuGroup
  rows: VerificationRow[]
}
