/**
 * The restaurant is in Goa, the server may be anywhere. Every date the business
 * cares about - the business date on an order, the 7pm-10pm steak window, report
 * boundaries - is computed in IST, never in the host timezone.
 *
 * India has no DST, so a fixed +05:30 offset is correct year round.
 */
export const IST_OFFSET_MINUTES = 330

type IstParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function istParts(at: Date = new Date()): IstParts {
  const shifted = new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  }
}

function pad(n: number, width = 2): string {
  return n.toString().padStart(width, '0')
}

export function istDateString(at: Date = new Date()): string {
  const p = istParts(at)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function istTimeString(at: Date = new Date()): string {
  const p = istParts(at)
  return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`
}

/**
 * Business date in IST. An order opened at 00:30 after a late night still belongs
 * to the previous day's sheet, so anything before startHour rolls back one day.
 */
export function businessDate(at: Date = new Date(), startHour = 6): string {
  const p = istParts(at)
  if (p.hour >= startHour) return `${p.year}-${pad(p.month)}-${pad(p.day)}`
  const previous = new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000 - 24 * 3_600_000)
  return `${previous.getUTCFullYear()}-${pad(previous.getUTCMonth() + 1)}-${pad(previous.getUTCDate())}`
}

/** "HH:MM" or "HH:MM:SS" -> seconds since midnight, or null if unparseable. */
function toSeconds(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  const s = Number(match[3] ?? '0')
  if (h > 23 || m > 59 || s > 59) return null
  return h * 3600 + m * 60 + s
}

/**
 * Is `at` inside the item's serving window? Null bounds mean "all day".
 * Windows that wrap past midnight (22:00-02:00) are handled too.
 */
export function isWithinWindow(
  from: string | null | undefined,
  to: string | null | undefined,
  at: Date = new Date(),
): boolean {
  const start = toSeconds(from)
  const end = toSeconds(to)
  if (start === null && end === null) return true

  const nowSeconds = toSeconds(istTimeString(at))
  if (nowSeconds === null) return true
  if (start !== null && end === null) return nowSeconds >= start
  if (start === null && end !== null) return nowSeconds <= end
  if (start === null || end === null) return true

  return start <= end
    ? nowSeconds >= start && nowSeconds <= end
    : nowSeconds >= start || nowSeconds <= end
}

/** "19:00:00" -> "7:00 PM", for showing why an item is greyed out. */
export function formatClock(value: string | null | undefined): string {
  const seconds = toSeconds(value)
  if (seconds === null) return ''
  const h24 = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const suffix = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${pad(m)} ${suffix}`
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** For bills and report headers: "02 Sep 2026". */
export function istDateLabel(at: Date = new Date()): string {
  const p = istParts(at)
  return `${pad(p.day)} ${MONTHS[p.month - 1]} ${p.year}`
}

export function istTimeLabel(at: Date = new Date()): string {
  return formatClock(istTimeString(at))
}

/** "2026-09-02" -> "02 Sep 2026". Falls back to the input if it is not a date. */
export function dateStringLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return value
  const month = Number(match[2])
  const name = MONTHS[month - 1]
  if (!name) return value
  return `${match[3]} ${name} ${match[1]}`
}

/** Both ends inclusive, ascending. Used to fill gaps in date-range reports. */
export function dateRange(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return []
  const out: string[] = []
  for (let t = start; t <= end && out.length < 400; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

/**
 * Date.parse rolls "2026-02-30" forward into March instead of rejecting it, which
 * would quietly hand a report the wrong day, so the parts are compared back.
 */
export function isDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const at = new Date(Date.UTC(year, month - 1, day))
  return at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day
}

