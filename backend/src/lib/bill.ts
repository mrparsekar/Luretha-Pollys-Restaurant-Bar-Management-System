import QRCode from 'qrcode'

import type { Settings } from '../db/schema'
import { env } from '../env'
import type { OrderDetail } from '../services/orders'
import { computeTotals, formatPaise, formatRupees, isLiquorGroup } from './money'
import { formatPhone } from './phone'
import { dateStringLabel, istTimeLabel } from './time'

export type BillLine = {
  id: number
  name: string
  variant: string | null
  qty: number
  unitPricePaise: number
  amountPaise: number
  note: string | null
  roundNo: number
  liquor: boolean
}

export type BillTotalRow = { label: string; amountPaise: number; strong?: boolean }

export type BillView = {
  restaurant: {
    name: string
    tagline: string | null
    address: string | null
    phone: string | null
    phoneSecondary: string | null
    instagram: string | null
  }
  order: {
    id: number
    orderNo: number
    businessDate: string
    dateLabel: string
    timeLabel: string
    status: string
    orderType: string
    tableLabel: string | null
    waiterName: string
    guests: number
    guestName: string | null
    guestPhone: string | null
    guestEmail: string | null
    paymentMode: string | null
  }
  lines: BillLine[]
  voided: BillLine[]
  rows: BillTotalRow[]
  subtotalPaise: number
  totalPaise: number
  totalLabel: string
  billUrl: string | null
  upi: { id: string; payeeName: string; payUrl: string } | null
  footer: string | null
  reviewUrl: string | null
}

export function billUrlFor(token: string | null): string | null {
  return token ? `${env.publicAppUrl}/bill/${token}` : null
}

function pct(bps: number): string {
  const value = bps / 100
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(2)}%`
}

export function upiPayUrl(
  config: Settings,
  amountPaise: number,
  reference: string,
): string | null {
  if (!config.upiId) return null
  const params = new URLSearchParams({
    pa: config.upiId,
    pn: config.upiPayeeName ?? config.restaurantName,
    am: (amountPaise / 100).toFixed(2),
    cu: 'INR',
    tn: reference,
  })
  return `upi://pay?${params.toString()}`
}

export async function upiQrDataUrl(payUrl: string): Promise<string> {
  return QRCode.toDataURL(payUrl, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
}

export function buildBill(detail: OrderDetail, config: Settings): BillView {
  const { order } = detail

  const toLine = (item: OrderDetail['items'][number]): BillLine => ({
    id: item.id,
    name: item.nameSnapshot,
    variant: item.variantSnapshot,
    qty: item.qty,
    unitPricePaise: item.unitPricePaise,
    amountPaise: item.unitPricePaise * item.qty,
    note: item.note,
    roundNo: item.roundNo,
    liquor: isLiquorGroup(item.groupSnapshot),
  })

  const lines = detail.items.filter((i) => i.status !== 'void').map(toLine)
  const voided = detail.items.filter((i) => i.status === 'void').map(toLine)

  /**
   * The stored columns are what the guest was charged, so they are what we print.
   * The recomputation is only used to split tax into its food and liquor halves;
   * if the owner has since changed the rates the split is dropped rather than
   * shown wrong.
   */
  const derived = computeTotals(
    detail.items.map((i) => ({
      groupSnapshot: i.groupSnapshot,
      unitPricePaise: i.unitPricePaise,
      qty: i.qty,
      status: i.status,
    })),
    { discountType: order.discountType, discountValue: order.discountValue },
    {
      taxEnabled: config.taxEnabled,
      foodTaxBps: config.foodTaxBps,
      liquorTaxBps: config.liquorTaxBps,
      serviceChargeBps: config.serviceChargeBps,
    },
  )
  const splitMatches = derived.taxPaise === order.taxPaise

  const rows: BillTotalRow[] = [{ label: 'Subtotal', amountPaise: order.subtotalPaise }]

  if (order.discountPaise > 0) {
    const label =
      order.discountType === 'percent'
        ? `Discount (${pct(order.discountValue)})`
        : 'Discount'
    rows.push({ label, amountPaise: -order.discountPaise })
  }

  if (order.taxPaise > 0) {
    if (splitMatches && derived.foodTaxPaise > 0) {
      rows.push({ label: `GST ${pct(config.foodTaxBps)}`, amountPaise: derived.foodTaxPaise })
    }
    if (splitMatches && derived.liquorTaxPaise > 0) {
      rows.push({ label: `VAT ${pct(config.liquorTaxBps)}`, amountPaise: derived.liquorTaxPaise })
    }
    if (!splitMatches || (derived.foodTaxPaise === 0 && derived.liquorTaxPaise === 0)) {
      rows.push({ label: 'Tax', amountPaise: order.taxPaise })
    }
  }

  if (order.serviceChargePaise > 0) {
    rows.push({
      label: `Service charge ${pct(config.serviceChargeBps)}`,
      amountPaise: order.serviceChargePaise,
    })
  }

  if (order.roundOffPaise !== 0) {
    rows.push({ label: 'Round off', amountPaise: order.roundOffPaise })
  }

  rows.push({ label: 'Total', amountPaise: order.totalPaise, strong: true })

  const reference = `Bill ${order.orderNo} ${dateStringLabel(order.businessDate)}`
  const payUrl = upiPayUrl(config, order.totalPaise, reference)

  return {
    restaurant: {
      name: config.restaurantName,
      tagline: config.tagline,
      address: config.address,
      phone: config.phonePrimary ? formatPhone(config.phonePrimary) : null,
      phoneSecondary: config.phoneSecondary ? formatPhone(config.phoneSecondary) : null,
      instagram: config.instagram,
    },
    order: {
      id: order.id,
      orderNo: order.orderNo,
      businessDate: order.businessDate,
      dateLabel: dateStringLabel(order.businessDate),
      timeLabel: istTimeLabel(order.settledAt ?? order.billedAt ?? order.openedAt),
      status: order.status,
      orderType: order.orderType,
      tableLabel: detail.tableLabel,
      waiterName: detail.waiterName,
      guests: order.guests,
      guestName: order.guestName,
      guestPhone: order.guestPhone,
      guestEmail: order.guestEmail,
      paymentMode: order.paymentMode,
    },
    lines,
    voided,
    rows,
    subtotalPaise: order.subtotalPaise,
    totalPaise: order.totalPaise,
    totalLabel: formatRupees(order.totalPaise),
    billUrl: billUrlFor(order.billToken),
    upi: payUrl && config.upiId ? { id: config.upiId, payeeName: config.upiPayeeName ?? config.restaurantName, payUrl } : null,
    footer: config.billFooter,
    reviewUrl: config.reviewUrl,
  }
}

function headerLines(bill: BillView): string[] {
  const where =
    bill.order.orderType === 'takeaway'
      ? 'Takeaway'
      : bill.order.tableLabel
        ? `Table ${bill.order.tableLabel}`
        : 'Dine in'
  return [
    `Bill #${bill.order.orderNo} - ${bill.order.dateLabel}, ${bill.order.timeLabel}`,
    where,
  ]
}

/** Plain text, WhatsApp flavoured (*bold*). Kept short: it is read on a phone. */
export function whatsappText(bill: BillView): string {
  const out: string[] = [`*${bill.restaurant.name}*`, ...headerLines(bill), '']

  for (const line of bill.lines) {
    const name = line.variant ? `${line.name} (${line.variant})` : line.name
    out.push(`${line.qty} x ${name} - ${formatPaise(line.amountPaise)}`)
  }

  out.push('')
  for (const row of bill.rows) {
    const amount = formatPaise(row.amountPaise)
    out.push(row.strong ? `*${row.label}: Rs ${amount}*` : `${row.label}: ${amount}`)
  }

  if (bill.order.paymentMode) {
    out.push(`Paid by ${bill.order.paymentMode === 'upi' ? 'UPI' : 'Cash'}`)
  }
  if (bill.billUrl) out.push('', `Full bill: ${bill.billUrl}`)
  if (bill.footer) out.push('', bill.footer)
  if (bill.reviewUrl) out.push(`Review us: ${bill.reviewUrl}`)

  return out.join('\n')
}

export function whatsappLink(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function billSubject(bill: BillView): string {
  return `${bill.restaurant.name} - Bill #${bill.order.orderNo} (${bill.order.dateLabel})`
}

/**
 * Inline styles only, no external CSS: that is the one thing every mail client
 * still renders the same way.
 */
export function billHtml(bill: BillView): string {
  const rows = bill.lines
    .map((line) => {
      const name = escapeHtml(line.variant ? `${line.name} (${line.variant})` : line.name)
      const note = line.note ? `<div style="color:#6b7280;font-size:12px">${escapeHtml(line.note)}</div>` : ''
      return `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0">${name}${note}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:center;width:44px">${line.qty}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;width:90px">${formatPaise(line.amountPaise)}</td>
    </tr>`
    })
    .join('')

  const totals = bill.rows
    .map((row) => {
      const weight = row.strong ? 'font-weight:700;font-size:16px' : 'color:#374151'
      const border = row.strong ? 'border-top:2px solid #111827' : ''
      return `<tr>
      <td colspan="2" style="padding:4px 0;text-align:right;${weight};${border}">${escapeHtml(row.label)}</td>
      <td style="padding:4px 0;text-align:right;${weight};${border}">${formatPaise(row.amountPaise)}</td>
    </tr>`
    })
    .join('')

  const contact = [bill.restaurant.address, bill.restaurant.phone, bill.restaurant.phoneSecondary]
    .filter(Boolean)
    .map((value) => escapeHtml(String(value)))
    .join(' &middot; ')

  const paid = bill.order.paymentMode
    ? `<p style="margin:12px 0 0;color:#065f46">Paid by ${bill.order.paymentMode === 'upi' ? 'UPI' : 'Cash'}</p>`
    : ''

  const link = bill.billUrl
    ? `<p style="margin:16px 0 0"><a href="${bill.billUrl}" style="color:#b45309">View or print this bill</a></p>`
    : ''

  const review = bill.reviewUrl
    ? `<p style="margin:6px 0 0"><a href="${bill.reviewUrl}" style="color:#b45309">Leave us a review</a></p>`
    : ''

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
    <h1 style="margin:0;font-size:20px">${escapeHtml(bill.restaurant.name)}</h1>
    ${bill.restaurant.tagline ? `<p style="margin:2px 0 0;color:#6b7280;font-size:13px">${escapeHtml(bill.restaurant.tagline)}</p>` : ''}
    <p style="margin:8px 0 0;color:#6b7280;font-size:13px">${contact}</p>
    <p style="margin:16px 0 0;font-size:14px">
      ${headerLines(bill).map((line) => escapeHtml(line)).join('<br>')}
    </p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px">
      <thead>
        <tr style="color:#6b7280;font-size:12px;text-transform:uppercase">
          <th style="text-align:left;padding-bottom:6px">Item</th>
          <th style="text-align:center;padding-bottom:6px">Qty</th>
          <th style="text-align:right;padding-bottom:6px">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>${totals}</tfoot>
    </table>
    ${paid}${link}${review}
    ${bill.footer ? `<p style="margin:20px 0 0;color:#6b7280;font-size:13px">${escapeHtml(bill.footer)}</p>` : ''}
  </div>
</body></html>`
}

