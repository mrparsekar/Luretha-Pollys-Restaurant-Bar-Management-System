import { desc, eq } from 'drizzle-orm'

import { db } from '../db/index.js'
import { billDeliveries, orders } from '../db/schema.js'
import {
  billHtml,
  billSubject,
  buildBill,
  upiQrDataUrl,
  whatsappLink,
  whatsappText,
  type BillView,
} from '../lib/bill.js'
import { ApiError } from '../lib/http.js'
import { sendMail } from '../lib/mail.js'
import { parseEmail, parsePhone } from '../lib/phone.js'
import { getOrderDetail, type OrderDetail } from '../services/orders.js'
import { getSettings } from './settings.js'

export type DeliveryOutcome = {
  channel: 'whatsapp' | 'email'
  target: string
  status: 'opened' | 'sent' | 'failed'
  /** WhatsApp only: the wa.me URL the phone should open. */
  link?: string
  text?: string
  error?: string
}

/**
 * One interface for both channels, so swapping the free wa.me hand-off for the
 * official Cloud API later is a new implementation rather than a rewrite.
 */
export type BillChannel = {
  channel: 'whatsapp' | 'email'
  normalise(raw: string): string | null
  deliver(bill: BillView, target: string): Promise<Omit<DeliveryOutcome, 'channel' | 'target'>>
}

export const whatsappChannel: BillChannel = {
  channel: 'whatsapp',
  normalise: (raw) => parsePhone(raw)?.digits ?? null,
  async deliver(bill, target) {
    // Nothing is sent from the server: we hand the phone a pre-filled message and
    // the owner taps send. That is what keeps this free and verification-free.
    const text = whatsappText(bill)
    return { status: 'opened', link: whatsappLink(target, text), text }
  },
}

export const emailChannel: BillChannel = {
  channel: 'email',
  normalise: (raw) => parseEmail(raw),
  async deliver(bill, target) {
    const result = await sendMail({
      to: target,
      subject: billSubject(bill),
      html: billHtml(bill),
      text: whatsappText(bill).replace(/\*/g, ''),
    })
    return result.ok ? { status: 'sent' } : { status: 'failed', error: result.error }
  },
}

async function billFor(orderId: number): Promise<{ detail: OrderDetail; bill: BillView }> {
  const [detail, config] = await Promise.all([getOrderDetail(orderId), getSettings()])
  return { detail, bill: buildBill(detail, config) }
}

export async function deliverBill(
  orderId: number,
  channel: BillChannel,
  rawTarget: string,
): Promise<DeliveryOutcome> {
  const target = channel.normalise(rawTarget)
  if (!target) {
    throw ApiError.badRequest(
      channel.channel === 'whatsapp' ? 'That phone number looks wrong.' : 'That email looks wrong.',
    )
  }

  const { detail, bill } = await billFor(orderId)
  if (!detail.order.billToken) {
    throw ApiError.conflict('Print or settle the bill first, so it gets a shareable link.')
  }

  const result = await channel.deliver(bill, target)

  await db.insert(billDeliveries).values({
    orderId,
    channel: channel.channel,
    target,
    status: result.status,
    error: result.error ?? null,
    sentAt: result.status === 'failed' ? null : new Date(),
  })

  // Keep the contact on the order so a re-send does not need retyping.
  await db
    .update(orders)
    .set(channel.channel === 'whatsapp' ? { guestPhone: `+${target}` } : { guestEmail: target })
    .where(eq(orders.id, orderId))

  if (result.status === 'failed') {
    throw ApiError.badRequest(result.error ?? 'Could not send the email.', { target })
  }

  return { channel: channel.channel, target, ...result }
}

export async function listDeliveries(orderId: number) {
  return db
    .select()
    .from(billDeliveries)
    .where(eq(billDeliveries.orderId, orderId))
    .orderBy(desc(billDeliveries.createdAt))
}

export async function upiQrFor(orderId: number): Promise<{ dataUrl: string; payUrl: string }> {
  const { bill } = await billFor(orderId)
  if (!bill.upi) throw ApiError.conflict('Add the UPI id in settings first.')
  return { dataUrl: await upiQrDataUrl(bill.upi.payUrl), payUrl: bill.upi.payUrl }
}

/** The public page shows the bill, never the guest's own contact details. */
export function publicBill(bill: BillView): BillView {
  return { ...bill, order: { ...bill.order, guestPhone: null, guestEmail: null } }
}
