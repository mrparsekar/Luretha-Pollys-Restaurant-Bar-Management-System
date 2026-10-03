import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AppShell } from '../components/AppShell'
import { Button, Empty, ErrorNote, Money, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { plural, rupeesShort, since } from '../lib/format'
import { usePoll, useTicker } from '../lib/hooks'
import type { FloorTable, Section } from '../lib/types'

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'indoor', label: 'Indoor' },
  { key: 'bar', label: 'Bar' },
  { key: 'garden', label: 'Garden' },
  { key: 'beach', label: 'Beach' },
]

/** Fast enough to catch a collision, slow enough not to hammer the API when solo. */
const SOLO_POLL_MS = 20_000
const BUSY_POLL_MS = 5_000

/**
 * The waiter's home. Tiles are tinted by state so the floor reads at a glance
 * from across the room: green is free, amber has a running tab, blue is billed
 * and waiting to be paid.
 */
export default function Floor(): ReactNode {
  // Two waiters can only actually collide on a table when more than one is
  // active at once, so the fast poll only kicks in then - otherwise this is
  // one phone polling an API nobody else is about to race.
  const [pollMs, setPollMs] = useState(SOLO_POLL_MS)
  const state = usePoll((signal) => api.tables.floor({ signal }), pollMs)
  const now = useTicker(30_000)
  const navigate = useNavigate()

  useEffect(() => {
    if (state.data) setPollMs((state.data.activeStaff ?? 0) > 1 ? BUSY_POLL_MS : SOLO_POLL_MS)
  }, [state.data])

  const tables = state.data?.tables ?? []
  const grouped = useMemo(() => {
    const map = new Map<Section, FloorTable[]>()
    for (const table of tables) {
      const list = map.get(table.section) ?? []
      list.push(table)
      map.set(table.section, list)
    }
    return map
  }, [tables])

  // A joined table shares its primary table's order, so count each order once
  // rather than once per table it spans.
  const runningOrders = useMemo(() => {
    const byId = new Map<number, NonNullable<FloorTable['order']>>()
    for (const table of tables) {
      if (table.order) byId.set(table.order.id, table.order)
    }
    return [...byId.values()]
  }, [tables])
  const openTotal = runningOrders.reduce((sum, order) => sum + order.totalPaise, 0)

  return (
    <AppShell
      subtitle={`${runningOrders.length} running · ${rupeesShort(openTotal)} on the floor`}
      action={
        <Link
          to="/new"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-sand px-3 py-2 text-xs font-bold text-ink active:bg-sand-deep"
        >
          + Order
        </Link>
      }
    >
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}
      {state.loading && !state.data ? <Spinner label="Loading floor" /> : null}

      {state.data && tables.length === 0 ? (
        <Empty title="No tables set up" hint="The owner can add tables under More → Tables." />
      ) : null}

      <div className="space-y-6">
        {SECTIONS.map(({ key, label }) => {
          const list = grouped.get(key)
          if (!list || list.length === 0) return null
          return (
            <section key={key}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                {label}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {list.map((table) => (
                  <TableTile
                    key={table.id}
                    table={table}
                    now={now}
                    onOpen={() =>
                      table.order
                        ? navigate(`/order/${table.order.id}`)
                        : navigate(`/new?table=${table.id}`)
                    }
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-6">
        <Button variant="secondary" block size="lg" onClick={() => navigate('/new?type=takeaway')}>
          Takeaway / parcel
        </Button>
      </div>
    </AppShell>
  )
}

function TableTile({
  table,
  now,
  onOpen,
}: {
  table: FloorTable
  now: number
  onOpen: () => void
}): ReactNode {
  const order = table.order
  const tone = !order
    ? 'border-slate-200 bg-white'
    : order.status === 'billed'
      ? 'border-billed bg-blue-50'
      : 'border-open bg-amber-50'

  return (
    <button
      onClick={onOpen}
      className={`flex min-h-24 flex-col justify-between rounded-2xl border-2 p-3 text-left active:opacity-80 ${tone}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-base font-bold">{table.label}</span>
        {order ? (
          <span className="tnum text-xs font-semibold text-slate-500">#{order.orderNo}</span>
        ) : (
          <span className="text-xs text-slate-400">{plural(table.seats, 'seat')}</span>
        )}
      </div>

      {order ? (
        <div>
          <Money paise={order.totalPaise} strong className="block text-lg" />
          <p className="text-xs text-slate-500">
            {table.joined
              ? `Joined to ${order.tableLabel ?? `#${order.orderNo}`}`
              : order.status === 'billed'
                ? 'Bill printed'
                : since(order.lastItemAt ?? order.openedAt, now)}
            {!table.joined && order.itemCount > 0 ? ` · ${order.itemCount} items` : ''}
          </p>
        </div>
      ) : (
        <span className="text-sm font-semibold text-free">Free</span>
      )}
    </button>
  )
}
