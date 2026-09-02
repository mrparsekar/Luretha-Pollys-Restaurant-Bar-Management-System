import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '../../components/AppShell'
import { Badge, Empty, ErrorNote, Money, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { plural, rupeesShort, since } from '../../lib/format'
import { usePoll, useTicker } from '../../lib/hooks'

/**
 * The owner's live board: what is running right now, longest wait first, and
 * today's money next to it. Everything here is read-only - one tap goes to the
 * order, where voids, discounts and settling live.
 */
export default function Board(): ReactNode {
  const running = usePoll((signal) => api.orders.running({ signal }), 15_000)
  const today = usePoll(() => api.reports.summary(), 60_000)
  const now = useTicker(30_000)

  const orders = [...(running.data?.orders ?? [])].sort(
    (a, b) =>
      new Date(a.lastItemAt ?? a.openedAt).getTime() -
      new Date(b.lastItemAt ?? b.openedAt).getTime(),
  )
  const sheet = today.data?.sheet

  return (
    <AppShell
      title="Live board"
      subtitle={sheet ? `${plural(sheet.orders, 'bill')} settled today` : 'Today'}
    >
      {running.error ? <ErrorNote message={running.error.message} onRetry={running.reload} /> : null}
      {today.error ? <ErrorNote message={today.error.message} onRetry={today.reload} /> : null}

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Tile
          label="Today"
          value={sheet ? rupeesShort(sheet.netPaise) : '—'}
          hint={sheet ? `${plural(sheet.covers, 'cover')}` : undefined}
        />
        <Tile
          label="On the floor"
          value={sheet ? rupeesShort(sheet.open.paise) : '—'}
          hint={sheet ? `${plural(sheet.open.orders, 'tab')} open` : undefined}
          tone="amber"
        />
        <Tile
          label="Cash"
          value={sheet ? rupeesShort(sheet.cash.paise) : '—'}
          hint={sheet ? `${sheet.cash.orders} bills` : undefined}
        />
        <Tile
          label="UPI"
          value={sheet ? rupeesShort(sheet.upi.paise) : '—'}
          hint={sheet ? `${sheet.upi.orders} bills` : undefined}
        />
      </div>

      {sheet && (sheet.discountPaise > 0 || sheet.voids.lines > 0) ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Today: {rupeesShort(sheet.discountPaise)} discounted ·{' '}
          {plural(sheet.voids.lines, 'line')} voided worth {rupeesShort(sheet.voids.paise)}.{' '}
          <Link to="/admin/more" className="font-semibold underline">
            See the audit trail
          </Link>
        </p>
      ) : null}

      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        Running tabs
      </h2>

      {running.loading && !running.data ? <Spinner label="Loading board" /> : null}
      {running.data && orders.length === 0 ? (
        <Empty title="No open tabs" hint="The floor is clear." />
      ) : null}

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {orders.map((order) => {
          const waited = Math.floor(
            (now - new Date(order.lastItemAt ?? order.openedAt).getTime()) / 60_000,
          )
          return (
            <li key={order.id}>
              <Link
                to={`/admin/orders/${order.id}`}
                className="flex items-center gap-3 p-3 active:bg-slate-50"
              >
                <span className="tnum w-10 shrink-0 text-base font-bold">#{order.orderNo}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {order.tableLabel ?? 'Takeaway'}
                    {order.guestName ? ` · ${order.guestName}` : ''}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {order.waiterName} · {plural(order.itemCount, 'item')} ·{' '}
                    {since(order.lastItemAt ?? order.openedAt, now)} since last item
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Money paise={order.totalPaise} strong className="block text-sm" />
                  {order.status === 'billed' ? (
                    <Badge tone="blue">billed</Badge>
                  ) : waited >= 30 ? (
                    <Badge tone="red">quiet {waited}m</Badge>
                  ) : null}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </AppShell>
  )
}

function Tile({
  label,
  value,
  hint,
  tone = 'ink',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'ink' | 'amber'
}): ReactNode {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === 'amber' ? 'border-open bg-amber-50' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="tnum text-2xl font-bold">{value}</p>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}
