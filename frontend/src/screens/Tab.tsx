import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '../components/AppShell'
import { GuestSheet } from '../components/GuestSheet'
import { OrderLines, Totals } from '../components/OrderLines'
import type { Draft } from '../components/ItemSheet'
import { Badge, Button, Card, Empty, ErrorNote, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { plural, since, timeLabel } from '../lib/format'
import { useAction, useAsync, useStoredState } from '../lib/hooks'
import type { OrderStatus } from '../lib/types'
import { useAuth } from '../state/auth'

const STATUS_TONE: Record<OrderStatus, 'amber' | 'blue' | 'green' | 'red'> = {
  open: 'amber',
  billed: 'blue',
  settled: 'green',
  void: 'red',
}

/** The running tab: every round as it was sent, the live total, and what to do next. */
export default function Tab(): ReactNode {
  const { id } = useParams()
  const orderId = Number(id)
  const navigate = useNavigate()
  const { isOwner } = useAuth()

  const state = useAsync((signal) => api.orders.detail(orderId, { signal }), [orderId])
  const action = useAction()
  const [draft] = useStoredState<Draft[]>(`lp.round.${orderId}`, [])
  const [editingGuest, setEditingGuest] = useState(false)

  const detail = state.data
  const order = detail?.order
  const mutable = order ? order.status === 'open' || order.status === 'billed' : false
  const unsent = draft.reduce((sum, line) => sum + line.qty, 0)

  const voidLine = async (itemId: number, reason: string) => {
    await action.run(() => api.orders.voidItem(orderId, itemId, reason))
    state.reload()
  }

  const requestBill = async () => {
    const result = await action.run(() => api.orders.markBilled(orderId))
    if (result) navigate(`/order/${orderId}/bill`)
  }

  return (
    <AppShell
      title={order ? `#${order.orderNo}${detail?.tableLabel ? ` · ${detail.tableLabel}` : ''}` : 'Order'}
      subtitle={
        order
          ? `${detail?.waiterName ?? ''} · opened ${timeLabel(order.openedAt)}${
              order.guests ? ` · ${plural(order.guests, 'guest')}` : ''
            }`
          : undefined
      }
    >
      {state.loading && !detail ? <Spinner label="Loading order" /> : null}
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      {detail && order ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[order.status]}>
              {order.status === 'billed' ? 'Bill printed' : order.status}
            </Badge>
            {order.orderType === 'takeaway' ? <Badge tone="slate">Takeaway</Badge> : null}
            {order.guestName ? <Badge tone="slate">{order.guestName}</Badge> : null}
            {order.lastItemAt ? (
              <span className="text-xs text-slate-500">last item {since(order.lastItemAt)} ago</span>
            ) : null}
          </div>

          {unsent > 0 ? (
            <Card className="border-open bg-amber-50">
              <p className="text-sm font-semibold">
                {plural(unsent, 'item')} still in a round you have not sent.
              </p>
              <Button
                variant="secondary"
                block
                className="mt-2"
                onClick={() => navigate(`/order/${orderId}/menu`)}
              >
                Finish that round
              </Button>
            </Card>
          ) : null}

          {detail.items.length === 0 ? (
            <Empty title="Nothing on this tab yet" hint="Add the first round below." />
          ) : (
            <OrderLines items={detail.items} onVoid={mutable ? (line, reason) => voidLine(line.id, reason) : undefined} />
          )}

          {detail.items.length > 0 ? <Totals bill={detail.bill} /> : null}

          {mutable ? (
            <div className="grid gap-3">
              <Button size="lg" block onClick={() => navigate(`/order/${orderId}/menu`)}>
                Add items
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  to={`/order/${orderId}/kot`}
                  className="flex min-h-14 items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold active:bg-slate-100"
                >
                  Print KOT
                </Link>
                <Button variant="secondary" size="lg" onClick={() => setEditingGuest(true)}>
                  Guest details
                </Button>
              </div>
              <Button
                variant="secondary"
                size="lg"
                block
                disabled={action.busy || detail.items.length === 0}
                onClick={requestBill}
              >
                {order.status === 'billed' ? 'Open bill' : 'Print bill'}
              </Button>
              {isOwner ? (
                <Link
                  to={`/admin/orders/${orderId}`}
                  className="flex min-h-14 items-center justify-center rounded-xl bg-sand text-sm font-bold text-ink active:bg-sand-deep"
                >
                  Discount &amp; settle
                </Link>
              ) : (
                <p className="text-center text-xs text-slate-500">
                  The owner settles the bill and takes payment.
                </p>
              )}
            </div>
          ) : (
            <Link
              to={`/order/${orderId}/bill`}
              className="flex min-h-14 items-center justify-center rounded-xl bg-ink text-sm font-bold text-cream"
            >
              View bill
            </Link>
          )}

          <GuestSheet
            open={editingGuest}
            onClose={() => setEditingGuest(false)}
            orderId={orderId}
            initial={{
              guestName: order.guestName ?? '',
              guestPhone: order.guestPhone ?? '',
              guestEmail: order.guestEmail ?? '',
            }}
            onSaved={() => {
              setEditingGuest(false)
              state.reload()
            }}
          />
        </div>
      ) : null}
    </AppShell>
  )
}
