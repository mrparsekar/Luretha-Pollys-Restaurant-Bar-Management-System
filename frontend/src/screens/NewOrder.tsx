import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { AppShell } from '../components/AppShell'
import { Button, Card, ErrorNote, Field, Input, Spinner, Stepper } from '../components/ui'
import { ApiError, api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import type { OrderType } from '../lib/types'

/**
 * Opening a tab is two taps: a table, then Open. The daily order number is
 * assigned by the API at this moment, so it is the number on the KOT and the bill.
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
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ApiError | null>(null)

  const tables = floor.data?.tables ?? []
  const clash = failure?.details as { orderId?: number } | undefined

  const open = async () => {
    setBusy(true)
    setFailure(null)
    try {
      const result = await api.orders.open({
        orderType,
        diningTableId: orderType === 'dine_in' ? tableId : null,
        guests: orderType === 'dine_in' ? guests : 0,
        guestName: guestName.trim() || null,
      })
      // Straight into the menu: the tab is empty and the guest is waiting.
      navigate(`/order/${result.order.id}/menu`, { replace: true })
    } catch (cause) {
      setFailure(
        cause instanceof ApiError ? cause : new ApiError(0, 'error', 'Could not open the order.'),
      )
    } finally {
      setBusy(false)
    }
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

        {failure ? (
          <div className="space-y-2">
            <ErrorNote message={failure.message} />
            {clash?.orderId ? (
              <Button variant="secondary" block onClick={() => navigate(`/order/${clash.orderId}`)}>
                Open that running tab
              </Button>
            ) : null}
          </div>
        ) : null}

        {orderType === 'dine_in' ? (
          <Card>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Table</p>
            {floor.loading ? <Spinner label="Loading tables" /> : null}
            {floor.error ? (
              <ErrorNote message={floor.error.message} onRetry={floor.reload} />
            ) : null}
            <div className="grid grid-cols-3 gap-2">
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
                      {taken ? `#${table.order?.orderNo}` : `${table.seats} seats`}
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

        <Button
          size="lg"
          block
          disabled={busy || (orderType === 'dine_in' && !tableId)}
          onClick={open}
        >
          {busy ? 'Opening…' : 'Open tab and add items'}
        </Button>
      </div>
    </AppShell>
  )
}
