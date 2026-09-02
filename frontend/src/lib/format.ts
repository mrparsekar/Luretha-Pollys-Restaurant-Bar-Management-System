/**
 * Display helpers. These mirror the backend's src/lib/money.ts and time.ts on
 * purpose: the same amount must read identically on the screen, the printed bill
 * and the WhatsApp message, so the rule "two decimals or none, never one" lives
 * in both places rather than being reformatted at the edge.
 */

const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const withPaise = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 123450 -> "1,234.50"; 123400 -> "1,234". No currency symbol. */
export function formatPaise(paise: number): string {
  const negative = paise < 0
  const abs = Math.abs(paise)
  const text = abs % 100 === 0 ? whole.format(abs / 100) : withPaise.format(abs / 100)
  return negative ? `-${text}` : text
}

export function rupees(paise: number): string {
  return `₹${formatPaise(paise)}`
}

/** Rounded to whole rupees, for tiles and headline numbers where paise are noise. */
export function rupeesShort(paise: number): string {
  return `₹${whole.format(Math.round(paise / 100))}`
}

/** "350" or "350.50" -> paise. Returns null on anything else. */
export function parseRupees(input: string): number | null {
  const text = input.trim()
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null
  return Math.round(Number(text) * 100)
}

export function bpsLabel(bps: number): string {
  const value = bps / 100
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(2)}%`
}

const IST_TIME = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const IST_DATE = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/**
 * Goa time, always. A phone that has wandered onto another timezone must still
 * agree with the kitchen clock and with the business date the API assigned.
 */
export function timeLabel(iso: string | null): string {
  if (!iso) return ''
  return IST_TIME.format(new Date(iso))
}

export function dateLabel(value: string | null): string {
  if (!value) return ''
  // Business dates arrive as bare 'YYYY-MM-DD' and must not be shifted by a zone.
  const at = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value)
  return IST_DATE.format(at)
}

/** "just now", "4m", "1h 12m" - how long a table has been waiting. */
export function since(iso: string | null, now: number = Date.now()): string {
  if (!iso) return ''
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

/** Today's date in Goa as 'YYYY-MM-DD', for seeding report date inputs. */
export function todayInGoa(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return parts
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
