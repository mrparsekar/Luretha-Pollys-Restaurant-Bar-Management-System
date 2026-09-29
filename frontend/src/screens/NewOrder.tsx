import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { AppShell } from '../components/AppShell'
import { Button, Card, ErrorNote, Field, Input, Spinner, Stepper } from '../components/ui'
import { api } from '../lib/api'
import { plural } from '../lib/format'
import { useAsync } from '../lib/hooks'
import type { OrderType } from '../lib/types'

/**
 * Picking a table is just picking - nothing is created yet. The order itself
 * only exists once the first round is actually sent from the menu screen, so a
 * mis-tap here costs nothing to undo: just navigate away.
 */
export default function NewOrder(): ReactNode {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const floor = useAsync((signal) => api.tables.floor({ signal }), [])

  const [orderType, setOrderType] = useState<OrderType>(
    params.get('type') === 'takeaway' ? 'takeaway' : 'dine_in',
  )
  const [tableId, setTableId] = useState<number | null>(() => {
    const raw = params.get('table')
    return raw ? Number(raw) : null
  })
  const [guests, setGuests] = useState(2)
  const [guestName, setGuestName] = useState('')

  const tables = floor.data?.tables ?? []
  const selectedTable = tables.find((entry) => entry.id === tableId) ?? null

  const proceed = () => {
    const next = new URLSearchParams({ type: orderType })
    if (orderType === 'dine_in' && tableId) {
      next.set('table', String(tableId))
      next.set('guests', String(guests))
      if (selectedTable) next.set('tableLabel', selectedTable.label)
    }
    if (guestName.trim()) next.set('guestName', guestName.trim())
    navigate(`/new/menu?${next.toString()}`)
  }

  return (
    <AppShell title="New order" subtitle="Pick a table or start a parcel">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant={orderType === 'dine_in' ? 'primary' : 'secondary'}
            size="lg"
            onClick={() => setOrderType('dine_in')}
          >
            Dine in
          </Button>
          <Button
            variant={orderType === 'takeaway' ? 'primary' : 'secondary'}
            size="lg"
            onClick={() => setOrderType('takeaway')}
          >
            Takeaway
          </Button>
        </div>

        {orderType === 'dine_in' ? (
          <Card>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Table</p>
            {floor.loading ? <Spinner label="Loading tables" /> : null}
            {floor.error ? (
              <ErrorNote message={floor.error.message} onRetry={floor.reload} />
            ) : null}
            <div className="grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-6">
              {tables.map((table) => {
                const taken = Boolean(table.order)
                const chosen = tableId === table.id
                return (
                  <button
                    key={table.id}
                    disabled={taken}
                    onClick={() => setTableId(table.id)}
                    className={`min-h-14 rounded-xl border-2 px-2 text-sm font-bold ${
                      chosen
                        ? 'border-ink bg-ink text-cream'
                        : taken
                          ? 'border-slate-200 bg-slate-100 text-slate-400'
                          : 'border-slate-300 bg-white text-ink active:bg-slate-100'
                    }`}
                  >
                    {table.label}
                    <span className="block text-[10px] font-normal">
                      {taken ? `#${table.order?.orderNo}` : plural(table.seats, 'seat')}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Guests
              </span>
              <Stepper value={guests} onChange={setGuests} min={1} max={60} label="Guests" />
            </div>
          </Card>
        ) : null}

        <Card>
          <Field
            label={orderType === 'takeaway' ? 'Guest name' : 'Guest name (optional)'}
            hint="Shows on the bill and helps you find the tab later."
          >
            <Input
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              placeholder="e.g. Rohan"
              maxLength={80}
            />
          </Field>
        </Card>

        <Button size="lg" block disabled={orderType === 'dine_in' && !tableId} onClick={proceed}>
          Choose items
        </Button>
      </div>
    </AppShell>
  )
}
