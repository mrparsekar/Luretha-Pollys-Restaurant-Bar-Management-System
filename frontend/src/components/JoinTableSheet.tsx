import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { Button, ErrorNote, Money, Sheet, Spinner } from './ui'
import { api } from '../lib/api'
import { plural } from '../lib/format'
import { useAction, useAsync } from '../lib/hooks'
import type { FloorTable } from '../lib/types'

/**
 * Lets a waiter push other tables into this tab, for a party that outgrows one
 * table. A free table just gets linked to this order; a table with its own
 * running order has that order folded in and closed, since it is now one tab.
 */
export function JoinTableSheet({
  open,
  onClose,
  orderId,
  primaryTableId,
  joinedTableIds,
  onJoined,
}: {
  open: boolean
  onClose: () => void
  orderId: number
  primaryTableId: number | null
  joinedTableIds: number[]
  onJoined: () => void
}): ReactNode {
  const floor = useAsync(
    (signal) => (open ? api.tables.floor({ signal }) : Promise.resolve(null)),
    [open],
  )
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const action = useAction()

  useEffect(() => {
    if (open) setSelected(new Set())
  }, [open])

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const candidates = (floor.data?.tables ?? []).filter(
    (table) => table.id !== primaryTableId && !joinedTableIds.includes(table.id) && !table.joined,
  )

  const confirm = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    const result = await action.run(async () => {
      for (const id of ids) await api.orders.joinTable(orderId, id)
      return true
    })
    if (result) onJoined()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Join a table">
      <p className="mb-3 text-xs text-slate-500">
        Pick another table pushed in with this one. A table with its own order has that order
        folded into this tab.
      </p>

      {floor.loading ? <Spinner label="Loading tables" /> : null}
      {floor.error ? <ErrorNote message={floor.error.message} onRetry={floor.reload} /> : null}
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      {floor.data && candidates.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
          No other tables free to join right now.
        </p>
      ) : null}

      <ul className="mb-4 grid grid-cols-2 gap-2">
        {candidates.map((table) => (
          <TableOption
            key={table.id}
            table={table}
            checked={selected.has(table.id)}
            onToggle={() => toggle(table.id)}
          />
        ))}
      </ul>

      <Button size="lg" block disabled={selected.size === 0 || action.busy} onClick={confirm}>
        {action.busy
          ? 'Joining…'
          : selected.size > 0
            ? `Join ${plural(selected.size, 'table')}`
            : 'Join'}
      </Button>
    </Sheet>
  )
}

function TableOption({
  table,
  checked,
  onToggle,
}: {
  table: FloorTable
  checked: boolean
  onToggle: () => void
}): ReactNode {
  return (
    <li>
      <button
        onClick={onToggle}
        className={`flex min-h-16 w-full flex-col items-start justify-center rounded-xl border-2 px-3 text-left ${
          checked ? 'border-ink bg-ink text-cream' : 'border-slate-300 bg-white active:bg-slate-100'
        }`}
      >
        <span className="text-sm font-bold">{table.label}</span>
        {table.order ? (
          <span className={`text-xs ${checked ? 'text-cream/70' : 'text-slate-500'}`}>
            #{table.order.orderNo} · <Money paise={table.order.totalPaise} />
          </span>
        ) : (
          <span className={`text-xs ${checked ? 'text-cream/70' : 'text-free'}`}>Free</span>
        )}
      </button>
    </li>
  )
}
