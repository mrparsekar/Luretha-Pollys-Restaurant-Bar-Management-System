import { describe, expect, it } from 'vitest'

import { hashSecret, isValidPin, verifySecret } from './password'
import {
  clearCookieOptions,
  createSessionToken,
  readSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  sessionCookieOptions,
} from './session'

describe('PIN and password hashing', () => {
  it('verifies the secret it hashed', async () => {
    const stored = await hashSecret('4731')
    expect(await verifySecret('4731', stored)).toBe(true)
  })

  it('rejects the wrong secret', async () => {
    const stored = await hashSecret('4731')
    expect(await verifySecret('4732', stored)).toBe(false)
    expect(await verifySecret('', stored)).toBe(false)
  })

  it('salts each hash, so two waiters on the same PIN do not share a hash', async () => {
    const [a, b] = await Promise.all([hashSecret('1234'), hashSecret('1234')])
    expect(a).not.toBe(b)
    expect(await verifySecret('1234', a)).toBe(true)
    expect(await verifySecret('1234', b)).toBe(true)
  })

  it('stores parameters with the hash so the cost can change later', async () => {
    const stored = await hashSecret('1234')
    expect(stored.split('$').slice(0, 4)).toEqual(['scrypt', '16384', '8', '1'])
  })

  it('refuses to verify against a missing or malformed hash', async () => {
    expect(await verifySecret('1234', null)).toBe(false)
    expect(await verifySecret('1234', '')).toBe(false)
    expect(await verifySecret('1234', 'not-a-hash')).toBe(false)
    expect(await verifySecret('1234', 'bcrypt$16384$8$1$aaaa$bbbb')).toBe(false)
    expect(await verifySecret('1234', 'scrypt$x$y$z$aaaa$bbbb')).toBe(false)
  })

  it('accepts 4 to 6 digit PINs only', () => {
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('473100')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('1234567')).toBe(false)
    expect(isValidPin('12a4')).toBe(false)
    expect(isValidPin(' 1234')).toBe(false)
  })
})

describe('session tokens', () => {
  const waiter = { sub: 7, role: 'waiter' as const, name: 'Smoke Waiter' }

  it('round-trips the signed-in staff member', () => {
    const payload = readSessionToken(createSessionToken(waiter))
    expect(payload).toMatchObject({ sub: 7, role: 'waiter', name: 'Smoke Waiter' })
  })

  it('lasts one long shift', () => {
    const now = Date.UTC(2026, 8, 2, 12, 0, 0)
    const payload = readSessionToken(createSessionToken(waiter, now), now)
    expect(SESSION_MAX_AGE_MS).toBe(12 * 60 * 60 * 1000)
    expect(payload!.exp - payload!.iat).toBe(12 * 60 * 60)
  })

  it('refuses a token past its expiry', () => {
    const now = Date.UTC(2026, 8, 2, 12, 0, 0)
    const token = createSessionToken(waiter, now)
    expect(readSessionToken(token, now + SESSION_MAX_AGE_MS - 1_000)).not.toBeNull()
    expect(readSessionToken(token, now + SESSION_MAX_AGE_MS + 1_000)).toBeNull()
  })

  it('refuses a token whose payload was edited to promote the waiter', () => {
    const token = createSessionToken(waiter)
    const [body, signature] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body!, 'base64url').toString('utf8')), role: 'owner' }),
      'utf8',
    ).toString('base64url')
    expect(readSessionToken(`${forged}.${signature}`)).toBeNull()
  })

  it('refuses a token signed with someone else s secret', () => {
    // A plausible-looking body with a random signature of the right shape.
    const body = Buffer.from(
      JSON.stringify({ sub: 1, role: 'owner', name: 'Owner', iat: 0, exp: 4_000_000_000 }),
      'utf8',
    ).toString('base64url')
    expect(readSessionToken(`${body}.${'x'.repeat(43)}`)).toBeNull()
  })

  it('refuses junk without throwing', () => {
    for (const token of ['', 'abc', '.abc', 'abc.', undefined, null]) {
      expect(readSessionToken(token as string | undefined)).toBeNull()
    }
  })

  it('sets an httpOnly, same-site cookie under a stable name', () => {
    const options = sessionCookieOptions()
    expect(SESSION_COOKIE).toBe('lp_session')
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
    expect(options.maxAge).toBe(SESSION_MAX_AGE_MS)
  })

  it('clears with the same attributes minus the lifetime', () => {
    expect(clearCookieOptions()).toMatchObject({ httpOnly: true, path: '/' })
    expect('maxAge' in clearCookieOptions()).toBe(false)
  })
})
