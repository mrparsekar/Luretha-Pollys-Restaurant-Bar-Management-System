import { useEffect } from 'react'
import type { ReactNode } from 'react'

import { formatPaise, rupees } from '../lib/format'
import type { BillView } from '../lib/types'

/**
 * Sets the print mode on <html> so the stylesheet can pick between the 58mm roll
 * and an A4 sheet. The client prints on whatever they already own, and the choice
 * is theirs at the moment of printing.
 */
export function usePrintMode(mode: 'receipt' | 'a4'): void {
  useEffect(() => {
    document.documentElement.dataset.print = mode
    return () => {
      delete document.documentElement.dataset.print
    }
  }, [mode])
}

/**
 * The bill itself. One component for the screen, the printer and the public link
 * a guest opens from WhatsApp, so what the guest sees is what was printed.
 */
export function BillPaper({
  bill,
  qrDataUrl,
}: {
  bill: BillView
  qrDataUrl?: string | null
}): ReactNode {
  const { restaurant, order } = bill

  return (
    <div className="paper mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-ink shadow-sm">
      <header className="border-b border-dashed border-slate-400 pb-3 text-center">
        <h1 className="text-lg font-bold uppercase tracking-wide">{restaurant.name}</h1>
        {restaurant.tagline ? <p className="text-xs">{restaurant.tagline}</p> : null}
        {restaurant.address ? <p className="mt-1 text-xs leading-snug">{restaurant.address}</p> : null}
        <p className="text-xs">
          {[restaurant.phone, restaurant.phoneSecondary].filter(Boolean).join(' · ')}
        </p>
        {restaurant.instagram ? <p className="text-xs">@{restaurant.instagram}</p> : null}
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-dashed border-slate-400 py-3 text-xs">
        <div className="flex gap-1">
          <dt className="text-slate-500">Bill</dt>
          <dd className="tnum font-bold">#{order.orderNo}</dd>
        </div>
        <div className="flex justify-end gap-1">
          <dt className="text-slate-500">Date</dt>
          <dd className="tnum">{order.dateLabel}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-slate-500">{order.tableLabel ? 'Table' : 'Type'}</dt>
          <dd className="font-semibold">{order.tableLabel ?? 'Takeaway'}</dd>
        </div>
        <div className="flex justify-end gap-1">
          <dt className="text-slate-500">Time</dt>
          <dd className="tnum">{order.timeLabel}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-slate-500">Waiter</dt>
          <dd>{order.waiterName}</dd>
        </div>
        {order.guests ? (
          <div className="flex justify-end gap-1">
            <dt className="text-slate-500">Guests</dt>
            <dd className="tnum">{order.guests}</dd>
          </div>
        ) : null}
        {order.guestName ? (
          <div className="col-span-2 flex gap-1">
            <dt className="text-slate-500">Guest</dt>
            <dd>{order.guestName}</dd>
          </div>
        ) : null}
      </dl>

      <table className="w-full border-b border-dashed border-slate-400 py-2 text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="w-6 py-1 font-normal">#</th>
            <th className="py-1 font-normal">Item</th>
            <th className="w-14 py-1 text-right font-normal">Rate</th>
            <th className="w-16 py-1 text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.lines.map((line) => (
            <tr key={line.id} className="align-top">
              <td className="tnum py-1">{line.qty}</td>
              <td className="py-1">
                {line.name}
                {line.variant ? <span className="text-slate-500"> ({line.variant})</span> : null}
                {line.note ? <span className="block text-slate-500">{line.note}</span> : null}
              </td>
              <td className="tnum py-1 text-right">{formatPaise(line.unitPricePaise)}</td>
              <td className="tnum py-1 text-right">{formatPaise(line.amountPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="py-3 text-sm">
        {bill.rows.map((row) => (
          <div
            key={row.label}
            className={`flex items-center justify-between py-0.5 ${
              row.strong ? 'mt-1 border-t border-slate-400 pt-1 text-base font-bold' : ''
            }`}
          >
            <dt>{row.label}</dt>
            <dd className="tnum">{rupees(row.amountPaise)}</dd>
          </div>
        ))}
      </dl>

      {order.paymentMode ? (
        <p className="text-center text-xs font-semibold uppercase tracking-wide">
          Paid by {order.paymentMode === 'upi' ? 'UPI' : 'Cash'}
        </p>
      ) : (
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
          Not settled yet
        </p>
      )}

      {qrDataUrl && !order.paymentMode ? (
        <div className="keep-together mt-3 text-center">
          <img src={qrDataUrl} alt="Scan to pay by UPI" className="mx-auto size-40" />
          <p className="text-xs">Scan to pay {bill.totalLabel} by UPI</p>
          {bill.upi ? <p className="text-xs text-slate-500">{bill.upi.id}</p> : null}
        </div>
      ) : null}

      <footer className="mt-3 border-t border-dashed border-slate-400 pt-3 text-center text-xs">
        {bill.footer ? <p>{bill.footer}</p> : null}
        {bill.reviewUrl ? <p className="a4-only text-slate-500">{bill.reviewUrl}</p> : null}
        {bill.voided.length > 0 ? (
          <p className="a4-only mt-2 text-slate-400">
            {bill.voided.length} voided {bill.voided.length === 1 ? 'line' : 'lines'} not charged
          </p>
        ) : null}
      </footer>
    </div>
  )
}
