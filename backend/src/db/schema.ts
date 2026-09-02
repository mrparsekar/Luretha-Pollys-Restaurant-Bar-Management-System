import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * Money is stored as integer paise everywhere. Nothing in this schema is a float:
 * bill arithmetic happens in integers and is only formatted to rupees at the edge
 * (see src/lib/money.ts).
 */

export const staffRole = pgEnum('staff_role', ['owner', 'waiter'])
export const menuGroup = pgEnum('menu_group', ['breakfast', 'food', 'bar', 'beverage', 'dessert'])
export const priceMode = pgEnum('price_mode', ['fixed', 'variant', 'ask'])
export const tableSection = pgEnum('table_section', ['indoor', 'garden', 'beach'])
export const orderType = pgEnum('order_type', ['dine_in', 'takeaway'])
export const orderStatus = pgEnum('order_status', ['open', 'billed', 'settled', 'void'])
export const orderItemStatus = pgEnum('order_item_status', ['placed', 'served', 'void'])
export const paymentMode = pgEnum('payment_mode', ['cash', 'upi'])
export const discountType = pgEnum('discount_type', ['none', 'amount', 'percent'])
export const deliveryChannel = pgEnum('delivery_channel', ['whatsapp', 'email'])
export const deliveryStatus = pgEnum('delivery_status', ['queued', 'opened', 'sent', 'failed'])

/** Single row (id = 1). Everything the owner can change without a redeploy. */
export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  restaurantName: text('restaurant_name').notNull(),
  tagline: text('tagline'),
  address: text('address'),
  phonePrimary: text('phone_primary'),
  phoneSecondary: text('phone_secondary'),
  instagram: text('instagram'),
  upiId: text('upi_id'),
  upiPayeeName: text('upi_payee_name'),
  reviewUrl: text('review_url'),
  billFooter: text('bill_footer'),
  /** Tax is off until the client confirms their GST position. */
  taxEnabled: boolean('tax_enabled').notNull().default(false),
  /** Applied to breakfast/food/beverage/dessert lines, in basis points (500 = 5%). */
  foodTaxBps: integer('food_tax_bps').notNull().default(0),
  /** Applied to bar lines, in basis points. */
  liquorTaxBps: integer('liquor_tax_bps').notNull().default(0),
  serviceChargeBps: integer('service_charge_bps').notNull().default(0),
  /** Orders opened before this hour (IST) belong to the previous business date. */
  businessDayStartHour: integer('business_day_start_hour').notNull().default(6),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const staff = pgTable(
  'staff',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    role: staffRole('role').notNull(),
    /** Owner signs in with email + password; waiters with a PIN only. */
    email: text('email'),
    passwordHash: text('password_hash'),
    pinHash: text('pin_hash'),
    isActive: boolean('is_active').notNull().default(true),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('staff_email_unique').on(t.email)],
)

export const categories = pgTable(
  'categories',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    group: menuGroup('group').notNull(),
    /** Printed-menu note, e.g. "Ask for price before placing your order". */
    note: text('note'),
    sort: integer('sort').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('categories_name_unique').on(t.name)],
)

export const menuItems = pgTable(
  'menu_items',
  {
    id: serial('id').primaryKey(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    priceMode: priceMode('price_mode').notNull().default('fixed'),
    /** Only for priceMode 'fixed'. Variant items price through item_variants. */
    basePricePaise: integer('base_price_paise'),
    isVeg: boolean('is_veg'),
    available: boolean('available').notNull().default(true),
    /** Beef steak is 7pm-10pm only; null means all day. */
    availFrom: time('avail_from'),
    availTo: time('avail_to'),
    note: text('note'),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [index('menu_items_category_idx').on(t.categoryId)],
)

export const itemVariants = pgTable(
  'item_variants',
  {
    id: serial('id').primaryKey(),
    itemId: integer('item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    /** "30ml", "60ml", "Glass", "Bottle", "Small", "Cup", "Pot", "1 scoop", "Veg" ... */
    label: text('label').notNull(),
    /** Null = printed without a price (seasonal); waiter is asked at order time. */
    pricePaise: integer('price_paise'),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [index('item_variants_item_idx').on(t.itemId)],
)

export const diningTables = pgTable(
  'dining_tables',
  {
    id: serial('id').primaryKey(),
    label: text('label').notNull(),
    section: tableSection('section').notNull().default('indoor'),
    seats: integer('seats').notNull().default(4),
    sort: integer('sort').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('dining_tables_label_unique').on(t.label)],
)

/** Race-free source of the per-day order number. */
export const dailyCounters = pgTable('daily_counters', {
  businessDate: date('business_date').primaryKey(),
  lastOrderNo: integer('last_order_no').notNull().default(0),
})

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    orderNo: integer('order_no').notNull(),
    businessDate: date('business_date').notNull(),
    orderType: orderType('order_type').notNull().default('dine_in'),
    diningTableId: integer('dining_table_id').references(() => diningTables.id, {
      onDelete: 'restrict',
    }),
    waiterId: integer('waiter_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'restrict' }),
    status: orderStatus('status').notNull().default('open'),
    guests: integer('guests').notNull().default(0),
    guestName: text('guest_name'),
    guestPhone: text('guest_phone'),
    guestEmail: text('guest_email'),
    subtotalPaise: integer('subtotal_paise').notNull().default(0),
    discountType: discountType('discount_type').notNull().default('none'),
    /** Paise when discountType = amount, basis points when percent. */
    discountValue: integer('discount_value').notNull().default(0),
    discountPaise: integer('discount_paise').notNull().default(0),
    taxPaise: integer('tax_paise').notNull().default(0),
    serviceChargePaise: integer('service_charge_paise').notNull().default(0),
    roundOffPaise: integer('round_off_paise').notNull().default(0),
    totalPaise: integer('total_paise').notNull().default(0),
    paymentMode: paymentMode('payment_mode'),
    notes: text('notes'),
    /** Unguessable token behind the public /bill/<token> page. */
    billToken: text('bill_token'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    lastItemAt: timestamp('last_item_at', { withTimezone: true }),
    billedAt: timestamp('billed_at', { withTimezone: true }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    settledById: integer('settled_by_id').references(() => staff.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('orders_day_no_unique').on(t.businessDate, t.orderNo),
    uniqueIndex('orders_bill_token_unique').on(t.billToken),
    index('orders_status_idx').on(t.status),
    index('orders_business_date_idx').on(t.businessDate),
  ],
)

/**
 * Name, variant, price and group are snapshotted so a settled bill never moves
 * when the owner later edits the menu, and so reports can split food vs liquor
 * for orders whose menu item has since been deleted.
 */
export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    roundNo: integer('round_no').notNull().default(1),
    menuItemId: integer('menu_item_id').references(() => menuItems.id, { onDelete: 'set null' }),
    variantId: integer('variant_id').references(() => itemVariants.id, { onDelete: 'set null' }),
    nameSnapshot: text('name_snapshot').notNull(),
    variantSnapshot: text('variant_snapshot'),
    categorySnapshot: text('category_snapshot').notNull(),
    groupSnapshot: menuGroup('group_snapshot').notNull(),
    unitPricePaise: integer('unit_price_paise').notNull(),
    qty: integer('qty').notNull().default(1),
    note: text('note'),
    status: orderItemStatus('status').notNull().default('placed'),
    createdById: integer('created_by_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    servedAt: timestamp('served_at', { withTimezone: true }),
    voidedById: integer('voided_by_id').references(() => staff.id, { onDelete: 'set null' }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId),
    index('order_items_created_at_idx').on(t.createdAt),
  ],
)

export const billDeliveries = pgTable(
  'bill_deliveries',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    channel: deliveryChannel('channel').notNull(),
    target: text('target').notNull(),
    status: deliveryStatus('status').notNull().default('queued'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [index('bill_deliveries_order_idx').on(t.orderId)],
)

/** Every void, discount, price override and menu price change lands here. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: serial('id').primaryKey(),
    actorId: integer('actor_id').references(() => staff.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_created_at_idx').on(t.createdAt)],
)

export type Staff = typeof staff.$inferSelect
export type Category = typeof categories.$inferSelect
export type MenuItem = typeof menuItems.$inferSelect
export type ItemVariant = typeof itemVariants.$inferSelect
export type DiningTable = typeof diningTables.$inferSelect
export type Order = typeof orders.$inferSelect
export type OrderItem = typeof orderItems.$inferSelect
export type Settings = typeof settings.$inferSelect
export type MenuGroup = (typeof menuGroup.enumValues)[number]
