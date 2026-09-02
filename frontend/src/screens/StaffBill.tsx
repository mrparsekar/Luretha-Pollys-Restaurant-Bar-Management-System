import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'

import { BillPaper, usePrintMode } from '../components/BillPaper'
import { Badge, Button, Card, ErrorNote, Field, Input, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { timeLabel } from '../lib/format'
import { useAction, useAsync } from '../lib/hooks'
import { useAuth } from '../state/auth'

/**
 * The staff bill: print it, send it, and - for the owner - settle it. WhatsApp is
 * a tap-to-send deep link, so the phone that opens it must have WhatsApp; the
 * message and the hosted bill link are built by the API.
 */
export default function StaffBill(): ReactNode {
  const { id } = useParams()
  const orderId = Number(id)
  const { isOwner } = useAuth()

  const state = useAsync((signal) => api.orders.detail(orderId, { signal }), [orderId])
  const deliveries = useAsync((signal) => api.bills.deliveries(orderId, { signal }), [orderId])
  const action = useAction()

  const [mode, setMode] = useState<'receipt' | 'a4'>('receipt')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  usePrintMode(mode)

  const detail = state.data
  const bill = detail?.bill
  const order = detail?.order

  // Prefill once the order arrives, without stamping over what is being typed.
  const phoneValue = phone || order?.guestPhone || ''
  const emailValue = email || order?.guestEmail || ''

  const sendWhatsapp = async () => {
    setSent(null)
    const result = await action.run(() => api.bills.whatsapp(orderId, phoneValue))
    if (!result) return
    deliveries.reload()
    if (result.delivery.link) {
      // A new tab, because the deep link hands the phone over to WhatsApp.
      window.open(result.delivery.link, '_blank', 'noopener')
      setSent('WhatsApp is open with the bill ready. Tap send there.')
    }
  }

  const sendEmail = async () => {
    setSent(null)
    const result = await action.run(() => api.bills.email(orderId, emailValue))
    if (!result) return
    deliveries.reload()
    setSent(`Emailed to ${result.delivery.target}.`)
  }

  const showQr = async () => {
    const result = await action.run(() => api.bills.upiQr(orderId))
    if (result) setQr(result.dataUrl)
  }

  return (
    <div className="min-h-dvh bg-cream">
      <header className="safe-top no-print sticky top-0 z-20 border-b border-ink-soft bg-ink text-cream">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-3">
          <Link to={`/order/${orderId}`} className="min-h-11 px-1 text-lg" aria-label="Back to tab">
            ‹
          </Link>
          <p className="flex-1 truncate text-sm font-bold">
            Bill {order ? `#${order.orderNo}` : ''}
          </p>
          <Button size="md" className="bg-sand text-ink" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 py-4">
        {state.loading && !detail ? <Spinner label="Loading bill" /> : null}
        {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}

        {bill && order ? (
          <div className="space-y-4">
            <div className="no-print flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Paper
              </span>
              <div className="flex gap-2">
                <Button
                  variant={mode === 'receipt' ? 'primary' : 'secondary'}
                  onClick={() => setMode('receipt')}
                >
                  58mm roll
                </Button>
                <Button
                  variant={mode === 'a4' ? 'primary' : 'secondary'}
                  onClick={() => setMode('a4')}
                >
                  A4
                </Button>
              </div>
            </div>

            <BillPaper bill={bill} qrDataUrl={qr} />

            {action.error ? (
              <div className="no-print">
                <ErrorNote message={action.error} />
              </div>
            ) : null}
            {sent ? (
              <p className="no-print rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                {sent}
              </p>
            ) : null}

            {bill.upi && !order.paymentMode ? (
              <Card className="no-print">
                <p className="text-sm font-semibold">UPI</p>
                <p className="mb-2 text-xs text-slate-500">
                  Show the QR at the table. The amount is filled in already.
                </p>
                <Button variant="secondary" block disabled={action.busy} onClick={showQr}>
                  {qr ? 'QR shown on the bill above' : 'Show UPI QR'}
                </Button>
              </Card>
            ) : null}

            <Card className="no-print">
              <p className="mb-2 text-sm font-semibold">Send to the guest</p>
              {!order.billToken ? (
                <p className="text-xs text-slate-500">
                  Print the bill first so it gets a shareable link.
                </p>
              ) : null}
              <div className="space-y-3">
                <Field label="WhatsApp" hint="Opens WhatsApp with the bill written out. You tap send.">
                  <Input
                    value={phoneValue}
                    onChange={(event) => setPhone(event.target.value)}
                    inputMode="tel"
                    placeholder="9309245800"
                    maxLength={20}
                  />
                </Field>
                <Button
                  block
                  disabled={action.busy || !order.billToken || phoneValue.trim().length < 6}
                  onClick={sendWhatsapp}
                >
                  Open WhatsApp
                </Button>

                <Field label="Email">
                  <Input
                    type="email"
                    value={emailValue}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="guest@example.com"
                    maxLength={254}
                  />
                </Field>
                <Button
                  variant="secondary"
                  block
                  disabled={action.busy || !order.billToken || emailValue.trim().length < 5}
                  onClick={sendEmail}
                >
                  Email the bill
                </Button>
              </div>
            </Card>

            {isOwner && order.status !== 'settled' ? (
              <Link
                to={`/admin/orders/${orderId}`}
                className="no-print flex min-h-14 items-center justify-center rounded-xl bg-sand text-sm font-bold text-ink active:bg-sand-deep"
              >
                Settle this bill
              </Link>
            ) : null}

            {(deliveries.data?.deliveries.length ?? 0) > 0 ? (
              <Card className="no-print">
                <p className="mb-2 text-sm font-semibold">Sent so far</p>
                <ul className="space-y-1 text-xs text-slate-600">
                  {deliveries.data?.deliveries.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {row.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} · {row.target}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge tone={row.status === 'failed' ? 'red' : 'green'}>{row.status}</Badge>
                        {timeLabel(row.sentAt ?? row.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  )
}
