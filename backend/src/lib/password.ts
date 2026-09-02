import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>

// scrypt with Node's built-in crypto: no native build step, no extra dependency.
const PARAMS = { N: 16_384, r: 8, p: 1 } as const
const KEY_LENGTH = 32
const PREFIX = 'scrypt'

/** Returns `scrypt$N$r$p$salt$key`, all base64url. */
export async function hashSecret(plain: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(plain.normalize('NFKC'), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: 64 * 1024 * 1024,
  })
  return [
    PREFIX,
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$')
}

export async function verifySecret(plain: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== PREFIX) return false

  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const saltRaw = parts[4]
  const keyRaw = parts[5]
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || !saltRaw || !keyRaw) {
    return false
  }

  const salt = Buffer.from(saltRaw, 'base64url')
  const expected = Buffer.from(keyRaw, 'base64url')
  try {
    const actual = await scrypt(plain.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/**
 * Burns roughly the same time as a real verification. Called when the account does
 * not exist so that a wrong PIN and an unknown PIN take the same time to answer.
 */
export async function dummyVerify(): Promise<void> {
  await scrypt('dummy', randomBytes(16), KEY_LENGTH, { ...PARAMS, maxmem: 64 * 1024 * 1024 })
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin)
}
