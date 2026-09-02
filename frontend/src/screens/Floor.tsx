import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AppShell } from '../components/AppShell'
import { Button, Empty, ErrorNote, Money, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { rupeesShort, since } from '../lib/format'
import { usePoll, useTicker } from '../lib/hooks'
import type { FloorTable, Section } from '../lib/types'

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'indoor', label: 'Indoor' },
  { key: 'garden', label: 'Garden' },
  { key: 'beach', label: 'Beach' },
]

/**
 * The waiter's home. Tiles are tinted by state so the floor reads at a glance
 * from across the room: green is free, amber has a running tab, blue is billed
 * and waiting to be paid.
 */
export default function Floor(): ReactNode {
  const state = usePoll((signal) => api.tables.floor({ signal }), 15_000)
  const now = useTicker(30_000)
  const navigate = useNavigate()

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

  const running = tables.filter((table) => table.order)
  const openTotal = running.reduce((sum, table) => sum + (table.order?.totalPaise ?? 0), 0)

  return (
    <AppShell
      subtitle={`${running.length} running · ${rupeesShort(openTotal)} on the floor`}
      action={
        <Link
          to="/new"
          className="min-h-11 rounded-xl bg-sand px-3 py-2 text-xs font-bold text-ink active:bg-sand-deep"
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
          <span className="text-xs text-slate-400">{table.seats} seats</span>
        )}
      </div>

      {order ? (
        <div>
          <Money paise={order.totalPaise} strong className="block text-lg" />
          <p className="text-xs text-slate-500">
            {order.status === 'billed' ? 'Bill printed' : since(order.lastItemAt ?? order.openedAt, now)}
            {order.itemCount > 0 ? ` · ${order.itemCount} items` : ''}
          </p>
        </div>
      ) : (
        <span className="text-sm font-semibold text-free">Free</span>
      )}
    </button>
  )
}
