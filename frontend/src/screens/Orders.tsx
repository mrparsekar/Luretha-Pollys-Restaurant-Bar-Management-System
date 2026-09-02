import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '../components/AppShell'
import { Badge, Empty, ErrorNote, Money, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { plural, since, timeLabel, todayInGoa } from '../lib/format'
import { useAsync } from '../lib/hooks'
import type { OrderStatus } from '../lib/types'
import { useAuth } from '../state/auth'

const FILTERS: { key: string; label: string; statuses: string }[] = [
  { key: 'running', label: 'Running', statuses: 'open,billed' },
  { key: 'settled', label: 'Settled', statuses: 'settled' },
  { key: 'void', label: 'Cancelled', statuses: 'void' },
]

const TONE: Record<OrderStatus, 'amber' | 'blue' | 'green' | 'red'> = {
  open: 'amber',
  billed: 'blue',
  settled: 'green',
  void: 'red',
}

/**
 * Today's tabs as a list. A waiter sees only their own - the API scopes it to the
 * session - which is what makes this safe to leave open on a shared phone.
 */
export default function Orders(): ReactNode {
  const { isOwner } = useAuth()
  const [filter, setFilter] = useState(FILTERS[0]?.key ?? 'running')
  const chosen = FILTERS.find((entry) => entry.key === filter) ?? FILTERS[0]
  const date = todayInGoa()

  const state = useAsync(
    () => api.orders.list({ status: chosen?.statuses, date }),
    [chosen?.statuses, date],
  )

  const orders = state.data?.orders ?? []
  const total = orders.reduce((sum, order) => sum + order.totalPaise, 0)

  return (
    <AppShell title="Orders" subtitle={`${plural(orders.length, 'tab')} today`}>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            onClick={() => setFilter(entry.key)}
            className={`min-h-11 rounded-xl text-sm font-semibold ${
              filter === entry.key ? 'bg-ink text-cream' : 'border border-slate-300 bg-white'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {state.loading && !state.data ? <Spinner label="Loading orders" /> : null}
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}
      {state.data && orders.length === 0 ? <Empty title="Nothing here yet" /> : null}

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              to={isOwner ? `/admin/orders/${order.id}` : `/order/${order.id}`}
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
                  {order.status === 'settled' && order.settledAt
                    ? timeLabel(order.settledAt)
                    : `${since(order.lastItemAt ?? order.openedAt)} ago`}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <Money paise={order.totalPaise} strong className="block text-sm" />
                <Badge tone={TONE[order.status]}>
                  {order.status === 'billed' ? 'billed' : order.paymentMode ?? order.status}
                </Badge>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {orders.length > 0 ? (
        <p className="mt-3 flex items-center justify-between rounded-xl bg-white p-3 text-sm font-semibold">
          <span>Total shown</span>
          <Money paise={total} strong />
        </p>
      ) : null}
    </AppShell>
  )
}
