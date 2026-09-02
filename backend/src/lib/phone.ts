/**
 * Guests give their number in every shape imaginable: "9309245800",
 * "093092 45800", "+91 93092-45800". Everything ends up as bare E.164 digits
 * because that is what wa.me wants, with +91 assumed for 10-digit local numbers.
 */
const INDIA_CC = '91'

export type Phone = {
  /** Digits only, country code included - what wa.me needs. */
  digits: string
  /** "+919309245800" - what we store and show. */
  e164: string
}

export function parsePhone(raw: string | null | undefined): Phone | null {
  if (!raw) return null
  const trimmed = raw.trim()
  const hadPlus = trimmed.startsWith('+')
  let digits = trimmed.replace(/\D+/g, '')
  if (!digits) return null

  if (!hadPlus) {
    // Local dialling habits: leading 0, or 91 already typed in.
    digits = digits.replace(/^0+/, '')
    if (digits.length === 10) digits = INDIA_CC + digits
  }

  if (digits.length < 10 || digits.length > 15) return null
  return { digits, e164: `+${digits}` }
}

export function formatPhone(raw: string | null | undefined): string {
  const parsed = parsePhone(raw)
  if (!parsed) return raw?.trim() ?? ''
  if (parsed.digits.startsWith(INDIA_CC) && parsed.digits.length === 12) {
    return `+${INDIA_CC} ${parsed.digits.slice(2, 7)} ${parsed.digits.slice(7)}`
  }
  return parsed.e164
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

export function parseEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase()
  if (!value || !EMAIL.test(value) || value.length > 254) return null
  return value
}
