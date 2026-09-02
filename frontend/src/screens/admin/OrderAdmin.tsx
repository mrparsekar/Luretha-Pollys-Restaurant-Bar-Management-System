import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AmountPad } from '../../components/AmountPad'
import { AppShell } from '../../components/AppShell'
import { OrderLines, Totals } from '../../components/OrderLines'
import { Badge, Button, Card, ErrorNote, Field, Input, Sheet, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { bpsLabel, plural, parseRupees, rupees, timeLabel } from '../../lib/format'
import { useAction, useAsync } from '../../lib/hooks'
import type { Order, OrderStatus, PaymentMode } from '../../lib/types'

type Panel = 'discount' | 'table' | 'settle' | 'cancel' | null

const LINK_BUTTON =
  'flex min-h-14 items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold active:bg-slate-100'

const STATUS_TONE: Record<OrderStatus, 'amber' | 'blue' | 'green' | 'red'> = {
  open: 'amber',
  billed: 'blue',
  settled: 'green',
  void: 'red',
}

/**
 * The owner's side of one order: void a line, discount it, move it to another
 * table, then take the money. Each of these is owner-only in the API as well -
 * this screen is the convenient way in, not the gate.
 */
export default function OrderAdmin(): ReactNode {
  const { id } = useParams()
  const orderId = Number(id)
  const navigate = useNavigate()
  const state = useAsync((signal) => api.orders.detail(orderId, { signal }), [orderId])
  const action = useAction()
  const [panel, setPanel] = useState<Panel>(null)

  const detail = state.data
  const order = detail?.order
  const liveLines = detail?.items.filter((item) => item.status !== 'void').length ?? 0
  const mutable = order?.status === 'open' || order?.status === 'billed'

  const done = () => {
    setPanel(null)
    state.reload()
  }

  const voidLine = async (itemId: number, reason: string) => {
    await action.run(() => api.orders.voidItem(orderId, itemId, reason))
    state.reload()
  }

  return (
    <AppShell
      title={order ? `Order #${order.orderNo}` : 'Order'}
      subtitle={detail ? `${detail.tableLabel ?? 'Takeaway'} · ${detail.waiterName}` : undefined}
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
          <Card className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {detail.tableLabel ?? 'Takeaway'} · {plural(order.guests, 'guest')}
              </p>
              <p className="text-xs text-slate-500">
                Opened {timeLabel(order.openedAt)} by {detail.waiterName}
                {order.settledAt ? ` · settled ${timeLabel(order.settledAt)}` : ''}
              </p>
              {order.guestName || order.guestPhone ? (
                <p className="mt-1 truncate text-xs text-slate-500">
                  {[order.guestName, order.guestPhone].filter(Boolean).join(' · ')}
                </p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <Badge tone={STATUS_TONE[order.status]}>
                {order.status === 'billed' ? 'bill printed' : order.status}
              </Badge>
              {order.paymentMode ? (
                <p className="mt-1 text-xs font-semibold uppercase text-slate-500">
                  {order.paymentMode}
                </p>
              ) : null}
            </div>
          </Card>

          {detail.items.length > 0 ? (
            <OrderLines items={detail.items} onVoid={mutable ? (line, reason) => voidLine(line.id, reason) : undefined} />
          ) : (
            <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No items on this tab yet.
            </p>
          )}

          {detail.items.length > 0 ? <Totals bill={detail.bill} /> : null}

          {order.discountType !== 'none' ? (
            <p className="text-xs text-slate-600">
              Discount:{' '}
              {order.discountType === 'percent'
                ? bpsLabel(order.discountValue)
                : rupees(order.discountValue)}{' '}
              ·{' '}
              <button className="font-semibold underline" onClick={() => setPanel('discount')}>
                change or remove
              </button>
            </p>
          ) : null}
          {mutable ? (
            <div className="grid gap-3">
              <Button
                size="lg"
                block
                disabled={liveLines === 0}
                onClick={() => setPanel('settle')}
              >
                Take payment
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" size="lg" onClick={() => setPanel('discount')}>
                  Discount
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  disabled={order.orderType !== 'dine_in'}
                  onClick={() => setPanel('table')}
                >
                  Change table
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Link to={`/order/${orderId}/menu`} className={LINK_BUTTON}>
                  Add items
                </Link>
                <Link to={`/order/${orderId}/bill`} className={LINK_BUTTON}>
                  Bill &amp; send
                </Link>
              </div>
              <Button
                variant="ghost"
                size="lg"
                className="text-nonveg"
                onClick={() => setPanel('cancel')}
              >
                Cancel this order
              </Button>
            </div>
          ) : (
            <Link
              to={`/order/${orderId}/bill`}
              className="flex min-h-14 items-center justify-center rounded-xl bg-ink text-sm font-bold text-cream"
            >
              Open the bill
            </Link>
          )}
        </div>
      ) : null}
      {order && panel === 'discount' ? (
        <DiscountPanel
          order={order}
          subtotalPaise={detail?.bill.subtotalPaise ?? 0}
          onClose={() => setPanel(null)}
          onDone={done}
        />
      ) : null}
      {order && panel === 'table' ? (
        <TablePanel
          orderId={orderId}
          currentTableId={order.diningTableId}
          onClose={() => setPanel(null)}
          onDone={done}
        />
      ) : null}
      {order && panel === 'settle' ? (
        <SettlePanel
          order={order}
          totalPaise={detail?.bill.totalPaise ?? order.totalPaise}
          onClose={() => setPanel(null)}
          // Straight to the bill: the next thing the owner does is send it.
          onDone={() => navigate(`/order/${orderId}/bill`)}
        />
      ) : null}
      {order && panel === 'cancel' ? (
        <CancelPanel orderId={orderId} onClose={() => setPanel(null)} onDone={done} />
      ) : null}
    </AppShell>
  )
}

/**
 * Both discount modes go through the same rupee pad, and that is not a shortcut:
 * "250" typed as an amount is 25000 paise, and "12.5" typed as a percent is 1250
 * basis points - which is exactly what the API wants in each case.
 */
function DiscountPanel({
  order,
  subtotalPaise,
  onClose,
  onDone,
}: {
  order: Order
  subtotalPaise: number
  onClose: () => void
  onDone: () => void
}): ReactNode {
  const [mode, setMode] = useState<'amount' | 'percent'>(
    order.discountType === 'percent' ? 'percent' : 'amount',
  )
  const [value, setValue] = useState('')
  const action = useAction()

  const entered = parseRupees(value) ?? 0
  // Percent arrives as basis points, so the discount is subtotal x bps / 10000.
  const takesOff = mode === 'amount' ? entered : Math.round((subtotalPaise * entered) / 10_000)
  const tooMuch = mode === 'amount' ? entered > subtotalPaise : entered > 10_000
  const apply = async () => {
    const result = await action.run(() => api.orders.setDiscount(order.id, mode, entered))
    if (result) onDone()
  }
  const clear = async () => {
    const result = await action.run(() => api.orders.setDiscount(order.id, 'none', 0))
    if (result) onDone()
  }

  return (
    <Sheet open onClose={onClose} title="Discount">
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      <div className="mb-3 grid grid-cols-2 gap-2">
        {(['amount', 'percent'] as const).map((option) => (
          <Button
            key={option}
            variant={mode === option ? 'primary' : 'secondary'}
            onClick={() => {
              setMode(option)
              setValue('')
            }}
          >
            {option === 'amount' ? 'By ₹' : 'By %'}
          </Button>
        ))}
      </div>

      <div className="mb-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-right">
        <span className="tnum text-2xl font-bold">
          {mode === 'amount' ? `₹${value || '0'}` : `${value || '0'}%`}
        </span>
        <p className="text-xs font-normal text-slate-500">
          {tooMuch
            ? mode === 'amount'
              ? 'More than the bill.'
              : 'Cannot be over 100%.'
            : `Takes ${rupees(takesOff)} off ${rupees(subtotalPaise)}`}
        </p>
      </div>

      <AmountPad value={value} onChange={setValue} />

      <div className="mt-3 grid gap-2">
        <Button
          size="lg"
          block
          disabled={action.busy || entered <= 0 || tooMuch}
          onClick={apply}
        >
          Apply discount
        </Button>
        {order.discountType !== 'none' ? (
          <Button variant="secondary" size="lg" block disabled={action.busy} onClick={clear}>
            Remove the discount
          </Button>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Discounts are logged against your name with the order.
      </p>
    </Sheet>
  )
}

/** Moving a tab: a table already carrying a tab is shown, but not tappable. */
function TablePanel({
  orderId,
  currentTableId,
  onClose,
  onDone,
}: {
  orderId: number
  currentTableId: number | null
  onClose: () => void
  onDone: () => void
}): ReactNode {
  const state = useAsync((signal) => api.tables.floor({ signal }), [])
  const action = useAction()
  const tables = state.data?.tables ?? []

  const move = async (tableId: number) => {
    const result = await action.run(() => api.orders.changeTable(orderId, tableId))
    if (result) onDone()
  }

  return (
    <Sheet open onClose={onClose} title="Move to another table">
      {state.loading && !state.data ? <Spinner label="Loading tables" /> : null}
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {tables.map((table) => {
          const taken = table.order !== null && table.order.id !== orderId
          const current = table.id === currentTableId
          return (
            <button
              key={table.id}
              disabled={taken || current || action.busy}
              onClick={() => move(table.id)}
              className={`min-h-16 rounded-xl border p-2 text-left ${
                current
                  ? 'border-ink bg-sand'
                  : taken
                    ? 'border-slate-200 bg-slate-100 opacity-60'
                    : 'border-slate-300 bg-white active:bg-slate-100'
              }`}
            >
              <span className="block text-sm font-bold">{table.label}</span>
              <span className="block truncate text-xs text-slate-500">
                {current ? 'current' : taken ? `#${table.order?.orderNo}` : table.section}
              </span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

/**
 * Settling is the one irreversible step in the app, so the money is shown large,
 * the guest's phone is captured here (it is what the WhatsApp bill needs), and
 * the UPI QR is fetched on demand rather than sitting on the screen.
 */
function SettlePanel({
  order,
  totalPaise,
  onClose,
  onDone,
}: {
  order: Order
  totalPaise: number
  onClose: () => void
  onDone: () => void
}): ReactNode {
  const [mode, setMode] = useState<PaymentMode>('cash')
  const [name, setName] = useState(order.guestName ?? '')
  const [phone, setPhone] = useState(order.guestPhone ?? '')
  const [email, setEmail] = useState(order.guestEmail ?? '')
  const [qr, setQr] = useState<string | null>(null)
  const action = useAction()
  const qrAction = useAction()

  const showQr = async () => {
    const result = await qrAction.run(() => api.bills.upiQr(order.id))
    if (result) setQr(result.dataUrl)
  }

  const settle = async () => {
    const result = await action.run(() =>
      api.orders.settle(order.id, {
        paymentMode: mode,
        guestName: name.trim() || null,
        guestPhone: phone.trim() || null,
        guestEmail: email.trim() || null,
      }),
    )
    if (result) onDone()
  }
  return (
    <Sheet open onClose={onClose} title={`Take payment · #${order.orderNo}`}>
      <p className="mb-3 rounded-xl bg-white p-4 text-center">
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
          To collect
        </span>
        <span className="tnum text-3xl font-bold">{rupees(totalPaise)}</span>
      </p>

      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      <div className="mb-3 grid grid-cols-2 gap-2">
        {(['cash', 'upi'] as PaymentMode[]).map((option) => (
          <Button
            key={option}
            size="lg"
            variant={mode === option ? 'primary' : 'secondary'}
            onClick={() => setMode(option)}
          >
            {option === 'cash' ? 'Cash' : 'UPI'}
          </Button>
        ))}
      </div>

      {mode === 'upi' ? (
        <div className="mb-3 text-center">
          {qr ? (
            <img
              src={qr}
              alt="UPI QR code for this bill"
              className="mx-auto size-48 rounded-xl border border-slate-300 bg-white p-2"
            />
          ) : (
            <Button variant="secondary" block disabled={qrAction.busy} onClick={showQr}>
              {qrAction.busy ? 'Making the QR…' : 'Show the UPI QR'}
            </Button>
          )}
          {qrAction.error ? (
            <p className="mt-2 text-xs text-nonveg">{qrAction.error}</p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              The guest scans this, then you mark it paid once the money lands.
            </p>
          )}
        </div>
      ) : null}
      <div className="mb-3 grid gap-3">
        <Field label="Guest name">
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
        </Field>
        <Field label="Phone" hint="For the WhatsApp bill. +91 is assumed.">
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            maxLength={20}
            placeholder="98XXXXXXXX"
          />
        </Field>
        <Field label="Email" hint="Leave blank if they do not want one.">
          <Input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            inputMode="email"
            maxLength={254}
          />
        </Field>
      </div>

      <Button size="lg" block disabled={action.busy} onClick={settle}>
        {action.busy ? 'Settling…' : `Mark paid by ${mode === 'cash' ? 'cash' : 'UPI'}`}
      </Button>
      <p className="mt-2 text-xs text-slate-500">
        This closes the tab and frees the table. It cannot be undone.
      </p>
    </Sheet>
  )
}

/** Cancelling a whole tab: the reason is the record, so it is required. */
function CancelPanel({
  orderId,
  onClose,
  onDone,
}: {
  orderId: number
  onClose: () => void
  onDone: () => void
}): ReactNode {
  const [reason, setReason] = useState('')
  const action = useAction()

  const cancel = async () => {
    const result = await action.run(() => api.orders.voidOrder(orderId, reason.trim()))
    if (result) onDone()
  }

  return (
    <Sheet open onClose={onClose} title="Cancel this order">
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}
      <p className="mb-3 text-sm text-slate-600">
        The whole tab is cancelled and the table is freed. Nothing is deleted - it stays on record
        with your name and this reason.
      </p>
      <Input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason: guest left, duplicate tab…"
        maxLength={200}
        className="mb-3"
      />
      <Button
        variant="danger"
        size="lg"
        block
        disabled={action.busy || reason.trim().length < 3}
        onClick={cancel}
      >
        Cancel order
      </Button>
    </Sheet>
  )
}
