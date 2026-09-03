import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '../../components/AppShell'
import { Badge, Button, ErrorNote, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { dateLabel, bpsLabel, rupees, timeLabel } from '../../lib/format'
import { useAsync } from '../../lib/hooks'
import type { AuditRow } from '../../lib/types'
import { useAuth } from '../../state/auth'

const TILE =
  'flex min-h-20 flex-col justify-center rounded-2xl border border-slate-200 bg-white p-3 active:bg-slate-50'

const LINKS = [
  { to: '/admin/menu', label: 'Menu', hint: 'Prices, 86, new items' },
  { to: '/admin/staff', label: 'Staff', hint: 'Waiters and PINs' },
  { to: '/admin/settings', label: 'Settings', hint: 'Bill details, tax' },
  { to: '/admin/verify', label: 'Price sheet', hint: 'Check against the card' },
  { to: '/orders', label: 'All orders', hint: 'Today and before' },
  { to: '/kitchen', label: 'Kitchen', hint: 'What is cooking' },
] as const

/** Only the actions worth reviewing get a friendly name; the rest read as-is. */
const ACTION_LABEL: Record<string, string> = {
  'order_item.void': 'Line voided',
  'order_item.ask_price': 'Price keyed in',
  'order.discount': 'Discount',
  'order.settle': 'Settled',
  'order.void': 'Order cancelled',
  'order.change_table': 'Table changed',
  'menu_item.price': 'Menu price',
  'menu_item.availability': '86 / back on',
  'menu_item.create': 'Item added',
  'menu_item.delete': 'Item removed',
  'item_variant.price': 'Size price',
  'item_variant.create': 'Size added',
  'item_variant.delete': 'Size removed',
  'settings.update': 'Settings',
  'staff.create': 'Staff added',
  'staff.update': 'Staff edited',
  'staff.reset_pin': 'PIN reset',
  'staff.reset_password': 'Password reset',
  'staff.unlock': 'Unlocked',
  'auth.locked': 'Locked out',
}

/** The three the owner actually hunts for, so they get their own filter. */
const FILTERS = [
  { key: '', label: 'Everything' },
  { key: 'order_item.void', label: 'Voids' },
  { key: 'order.discount', label: 'Discounts' },
  { key: 'menu_item', label: 'Menu edits' },
] as const

type Box = Record<string, unknown>

/** Audit payloads are free-form JSON, so every read out of them is guarded. */
function box(value: unknown): Box {
  return value !== null && typeof value === 'object' ? (value as Box) : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

/** The reason a line or a tab was killed. It is the whole point of the entry. */
function reason(row: AuditRow): string | null {
  return text(box(row.after).reason)
}

/** What the entry is about: an item, a size, a person. */
function subject(row: AuditRow): string | null {
  const before = box(row.before)
  const after = box(row.after)
  const name = text(after.name) ?? text(before.name)
  const variant = text(after.variant) ?? text(before.variant)
  if (name) return variant ? `${name} (${variant})` : name
  const label = text(after.label) ?? text(before.label)
  const item = text(after.item)
  if (label) return item ? `${item} · ${label}` : label
  return null
}

/** The one-line "what changed", read off whichever side of the entry carries it. */
function detail(row: AuditRow): string | null {
  const before = box(row.before)
  const after = box(row.after)

  if (row.action === 'order.discount') {
    const value = num(after.discountValue) ?? 0
    if (after.discountType === 'percent') return bpsLabel(value)
    if (after.discountType === 'amount') return rupees(value)
    return 'removed'
  }
  if (row.action === 'order.settle') {
    const mode = text(after.paymentMode)
    return mode ? mode.toUpperCase() : null
  }
  if (row.action === 'menu_item.availability') return after.available === false ? '86' : 'back on'

  const from = num(before.basePricePaise) ?? num(before.pricePaise)
  const to = num(after.basePricePaise) ?? num(after.pricePaise)
  if (from !== null && to !== null && from !== to) return `${rupees(from)} → ${rupees(to)}`
  if (to !== null) return rupees(to)
  const unit = num(after.unitPricePaise) ?? num(before.unitPricePaise)
  return unit === null ? null : rupees(unit)
}

/** Both sides of an order entry carry the order number the owner recognises. */
function orderNo(row: AuditRow): number | null {
  return num(box(row.after).orderNo) ?? num(box(row.before).orderNo)
}

/**
 * The owner's hub: the screens that are not the board or the reports, plus the
 * audit trail. Every void, discount and price edit is on this list with a name
 * against it - which is the point of logging them at all.
 */
export default function More(): ReactNode {
  const { user, settings } = useAuth()
  const [filter, setFilter] = useState<string>('')
  const state = useAsync(
    () => api.reports.audit(filter ? { limit: 60, action: filter } : { limit: 60 }),
    [filter],
  )

  const entries = state.data?.entries ?? []

  return (
    <AppShell title="More" subtitle={settings?.restaurantName ?? undefined}>
      <div className="mb-5 grid grid-cols-2 gap-3">
        {LINKS.map((link) => (
          <Link key={link.to} to={link.to} className={TILE}>
            <span className="text-sm font-bold">{link.label}</span>
            <span className="text-xs text-slate-500">{link.hint}</span>
          </Link>
        ))}
      </div>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          What happened
        </h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {FILTERS.map((entry) => (
            <Button
              key={entry.key}
              size="md"
              variant={filter === entry.key ? 'primary' : 'secondary'}
              onClick={() => setFilter(entry.key)}
            >
              {entry.label}
            </Button>
          ))}
        </div>

        {state.loading && !state.data ? <Spinner label="Loading the log" /> : null}
        {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}

        {state.data && entries.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            Nothing logged yet.
          </p>
        ) : null}

        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {entries.map((row) => {
            const why = reason(row)
            const extra = detail(row)
            const what = subject(row)
            const no = orderNo(row)
            // Only entries logged against an order carry an id worth linking to.
            const orderId = row.entity === 'order' && row.entityId ? Number(row.entityId) : null
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {ACTION_LABEL[row.action] ?? row.action}
                      {what ? ` · ${what}` : ''}
                    </span>
                    {extra ? <Badge tone="slate">{extra}</Badge> : null}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {row.actorName ?? 'system'}
                    {no !== null ? ` · #${no}` : ''} · {dateLabel(row.createdAt)}{' '}
                    {timeLabel(row.createdAt)}
                  </span>
                  {why ? (
                    <span className="mt-0.5 block truncate text-xs italic text-slate-600">
                      “{why}”
                    </span>
                  ) : null}
                </span>
                {orderId ? (
                  <span aria-hidden className="shrink-0 text-slate-400">
                    ›
                  </span>
                ) : null}
              </>
            )
            return (
              <li key={row.id}>
                {orderId ? (
                  <Link
                    to={`/admin/orders/${orderId}`}
                    className="flex items-center gap-3 p-3 active:bg-slate-50"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 p-3">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Newest first, last 60. Signed in as {user?.name ?? 'owner'}.
        </p>
      </section>
    </AppShell>
  )
}
