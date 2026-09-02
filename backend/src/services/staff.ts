import { and, asc, eq, ne, sql } from 'drizzle-orm'

import { db } from '../db'
import { orders, staff, type Staff } from '../db/schema'
import { recordAudit } from '../lib/audit'
import { ApiError } from '../lib/http'
import { hashSecret, isValidPin } from '../lib/password'
import type { SessionPayload, SessionRole } from '../lib/session'
import { forgetStaff } from '../middleware/auth'

export type StaffView = {
  id: number
  name: string
  role: SessionRole
  email: string | null
  isActive: boolean
  hasPin: boolean
  hasPassword: boolean
  lockedUntil: Date | null
  openOrders: number
}

export async function listStaff(): Promise<StaffView[]> {
  const rows = await db
    .select({
      id: staff.id,
      name: staff.name,
      role: staff.role,
      email: staff.email,
      isActive: staff.isActive,
      pinHash: staff.pinHash,
      passwordHash: staff.passwordHash,
      lockedUntil: staff.lockedUntil,
      openOrders: sql<number>`(
        select count(*) from orders o
        where o.waiter_id = ${staff.id} and o.status in ('open', 'billed')
      )`,
    })
    .from(staff)
    .orderBy(asc(staff.role), asc(staff.name))

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    isActive: row.isActive,
    hasPin: Boolean(row.pinHash),
    hasPassword: Boolean(row.passwordHash),
    lockedUntil: row.lockedUntil,
    openOrders: Number(row.openOrders),
  }))
}

async function find(id: number): Promise<Staff> {
  const row = (await db.select().from(staff).where(eq(staff.id, id)).limit(1))[0]
  if (!row) throw ApiError.notFound('That staff member does not exist.')
  return row
}

export type NewStaff = {
  name: string
  role: SessionRole
  email?: string | null
  password?: string | null
  pin?: string | null
}

export async function createStaff(input: NewStaff, session: SessionPayload): Promise<StaffView> {
  const email = input.email?.trim().toLowerCase() || null
  if (input.role === 'owner' && (!email || !input.password)) {
    throw ApiError.badRequest('An owner needs an email and a password.')
  }
  if (input.pin && !isValidPin(input.pin)) {
    throw ApiError.badRequest('A PIN must be 4 to 6 digits.')
  }
  if (input.role === 'waiter' && !input.pin) {
    throw ApiError.badRequest('A waiter needs a PIN to sign in.')
  }
  if (email) {
    const clash = (await db.select({ id: staff.id }).from(staff).where(eq(staff.email, email)).limit(1))[0]
    if (clash) throw ApiError.conflict('That email is already in use.')
  }

  const created = (
    await db
      .insert(staff)
      .values({
        name: input.name.trim(),
        role: input.role,
        email,
        passwordHash: input.password ? await hashSecret(input.password) : null,
        pinHash: input.pin ? await hashSecret(input.pin) : null,
      })
      .returning()
  )[0]
  if (!created) throw new Error('Could not add the staff member')

  await recordAudit({
    actorId: session.sub,
    action: 'staff.create',
    entity: 'staff',
    entityId: created.id,
    after: { name: created.name, role: created.role },
  })

  const view = await listStaff()
  const found = view.find((row) => row.id === created.id)
  if (!found) throw new Error('Could not read the new staff member back')
  return found
}

export type StaffPatch = {
  name?: string
  email?: string | null
  isActive?: boolean
  role?: SessionRole
}

export async function updateStaff(
  id: number,
  patch: StaffPatch,
  session: SessionPayload,
): Promise<Staff> {
  const before = await find(id)

  if (patch.isActive === false || (patch.role && patch.role !== before.role)) {
    if (id === session.sub) throw ApiError.badRequest('You cannot change your own access.')
  }

  // Never let the last owner lock themselves out of the system.
  if ((patch.isActive === false || (patch.role && patch.role !== 'owner')) && before.role === 'owner') {
    const others = (
      await db
        .select({ count: sql<number>`count(*)` })
        .from(staff)
        .where(and(eq(staff.role, 'owner'), eq(staff.isActive, true), ne(staff.id, id)))
    )[0]
    if (Number(others?.count ?? 0) === 0) {
      throw ApiError.conflict('This is the only active owner account.')
    }
  }

  if (patch.isActive === false) {
    const running = (
      await db
        .select({ orderNo: orders.orderNo })
        .from(orders)
        .where(and(eq(orders.waiterId, id), sql`${orders.status} in ('open', 'billed')`))
        .limit(1)
    )[0]
    if (running) {
      throw ApiError.conflict(`Order #${running.orderNo} is still open under this account.`)
    }
  }

  const email = patch.email === undefined ? undefined : patch.email?.trim().toLowerCase() || null
  if (email) {
    const clash = (
      await db.select({ id: staff.id }).from(staff).where(and(eq(staff.email, email), ne(staff.id, id))).limit(1)
    )[0]
    if (clash) throw ApiError.conflict('That email is already in use.')
  }

  const updated = (
    await db
      .update(staff)
      .set({
        name: patch.name?.trim() ?? before.name,
        email: email === undefined ? before.email : email,
        isActive: patch.isActive ?? before.isActive,
        role: patch.role ?? before.role,
      })
      .where(eq(staff.id, id))
      .returning()
  )[0]
  if (!updated) throw new Error('Could not update the staff member')
  forgetStaff(id)

  await recordAudit({
    actorId: session.sub,
    action: 'staff.update',
    entity: 'staff',
    entityId: id,
    before: { name: before.name, role: before.role, isActive: before.isActive },
    after: { name: updated.name, role: updated.role, isActive: updated.isActive },
  })
  return updated
}

export async function setPin(id: number, pin: string, session: SessionPayload): Promise<void> {
  if (!isValidPin(pin)) throw ApiError.badRequest('A PIN must be 4 to 6 digits.')
  const before = await find(id)

  await db
    .update(staff)
    .set({ pinHash: await hashSecret(pin), failedAttempts: 0, lockedUntil: null })
    .where(eq(staff.id, id))
  forgetStaff(id)

  await recordAudit({
    actorId: session.sub,
    action: 'staff.reset_pin',
    entity: 'staff',
    entityId: id,
    after: { name: before.name },
  })
}

export async function setPassword(
  id: number,
  password: string,
  session: SessionPayload,
): Promise<void> {
  if (password.length < 8) throw ApiError.badRequest('Use at least 8 characters.')
  const before = await find(id)

  await db
    .update(staff)
    .set({ passwordHash: await hashSecret(password), failedAttempts: 0, lockedUntil: null })
    .where(eq(staff.id, id))
  forgetStaff(id)

  await recordAudit({
    actorId: session.sub,
    action: 'staff.reset_password',
    entity: 'staff',
    entityId: id,
    after: { name: before.name },
  })
}

/** Clears a lockout early, when the owner is standing right there. */
export async function unlockStaff(id: number, session: SessionPayload): Promise<void> {
  const before = await find(id)
  await db.update(staff).set({ failedAttempts: 0, lockedUntil: null }).where(eq(staff.id, id))
  forgetStaff(id)
  await recordAudit({
    actorId: session.sub,
    action: 'staff.unlock',
    entity: 'staff',
    entityId: id,
    after: { name: before.name },
  })
}

