import { and, asc, eq, isNotNull } from 'drizzle-orm'

import { db } from '../db/index.js'
import { staff, type Staff } from '../db/schema.js'
import { recordAudit } from '../lib/audit.js'
import { ApiError } from '../lib/http.js'
import { dummyVerify, verifySecret } from '../lib/password.js'
import type { SessionPayload, SessionRole } from '../lib/session.js'
import { forgetStaff } from '../middleware/auth.js'

/** Five wrong tries then a five minute cool-off. Enough to stop guessing a 4-digit PIN. */
export const MAX_ATTEMPTS = 5
export const LOCK_MS = 5 * 60 * 1000

export type LoginStaff = { id: number; name: string; role: SessionRole }

/**
 * The waiter login screen needs the list of names to tap. Ids and names only -
 * no hashes, no email, and inactive staff are hidden.
 */
export async function listLoginStaff(): Promise<LoginStaff[]> {
  const rows = await db
    .select({ id: staff.id, name: staff.name, role: staff.role })
    .from(staff)
    .where(and(eq(staff.isActive, true), isNotNull(staff.pinHash)))
    .orderBy(asc(staff.role), asc(staff.name))
  return rows
}

function lockRemainingMinutes(row: Staff, now: number): number {
  const until = row.lockedUntil?.getTime() ?? 0
  return until > now ? Math.max(1, Math.ceil((until - now) / 60_000)) : 0
}

async function registerFailure(row: Staff, now: number): Promise<never> {
  const attempts = row.failedAttempts + 1
  const locked = attempts >= MAX_ATTEMPTS
  await db
    .update(staff)
    .set({
      failedAttempts: locked ? 0 : attempts,
      lockedUntil: locked ? new Date(now + LOCK_MS) : row.lockedUntil,
    })
    .where(eq(staff.id, row.id))

  if (locked) {
    await recordAudit({
      actorId: null,
      action: 'auth.locked',
      entity: 'staff',
      entityId: row.id,
      after: { name: row.name, minutes: LOCK_MS / 60_000 },
    })
    throw ApiError.tooMany(`Too many wrong tries. Try again in ${LOCK_MS / 60_000} minutes.`)
  }

  const left = MAX_ATTEMPTS - attempts
  throw ApiError.unauthorized(
    left <= 2 ? `Wrong details. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Wrong details.',
  )
}

async function registerSuccess(row: Staff): Promise<SessionPayload> {
  if (row.failedAttempts !== 0 || row.lockedUntil) {
    await db.update(staff).set({ failedAttempts: 0, lockedUntil: null }).where(eq(staff.id, row.id))
  }
  forgetStaff(row.id)
  const now = Math.floor(Date.now() / 1000)
  return { sub: row.id, role: row.role, name: row.name, iat: now, exp: now }
}

export async function loginWithPin(staffId: number, pin: string): Promise<SessionPayload> {
  const now = Date.now()
  const row = (await db.select().from(staff).where(eq(staff.id, staffId)).limit(1))[0]

  if (!row || !row.isActive || !row.pinHash) {
    // Same cost as a real check so a wrong id and a wrong PIN feel identical.
    await dummyVerify()
    throw ApiError.unauthorized('Wrong details.')
  }

  const locked = lockRemainingMinutes(row, now)
  if (locked > 0) {
    throw ApiError.tooMany(`Locked after too many wrong tries. Try again in ${locked} min.`)
  }

  if (!(await verifySecret(pin, row.pinHash))) return registerFailure(row, now)
  return registerSuccess(row)
}

export async function loginOwner(email: string, password: string): Promise<SessionPayload> {
  const now = Date.now()
  const normalised = email.trim().toLowerCase()
  const row = (await db.select().from(staff).where(eq(staff.email, normalised)).limit(1))[0]

  if (!row || !row.isActive || !row.passwordHash || row.role !== 'owner') {
    await dummyVerify()
    throw ApiError.unauthorized('Wrong email or password.')
  }

  const locked = lockRemainingMinutes(row, now)
  if (locked > 0) {
    throw ApiError.tooMany(`Locked after too many wrong tries. Try again in ${locked} min.`)
  }

  if (!(await verifySecret(password, row.passwordHash))) return registerFailure(row, now)
  return registerSuccess(row)
}
