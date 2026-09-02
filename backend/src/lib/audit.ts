import { desc, eq, sql } from 'drizzle-orm'

import { db } from '../db'
import { auditLog, staff } from '../db/schema'

export type AuditEntry = {
  actorId: number | null
  action: string
  entity: string
  entityId?: string | number | null
  before?: unknown
  after?: unknown
}

/**
 * Voids, discounts, ask-price entries, menu price edits, PIN resets and settle
 * events all land here. In a bar this is the owner's only real control against
 * shrinkage, so a failed write must never take the operation down with it - the
 * order has already been committed by the time we get here.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId == null ? null : String(entry.entityId),
      before: entry.before ?? null,
      after: entry.after ?? null,
    })
  } catch (error) {
    console.error('[audit] failed to record', entry.action, error)
  }
}

export type AuditRow = {
  id: number
  actorId: number | null
  actorName: string | null
  action: string
  entity: string
  entityId: string | null
  before: unknown
  after: unknown
  createdAt: Date
}

/** Owner's review list: newest first, optionally filtered to one kind of action. */
export async function listAuditLog(options: { limit?: number; action?: string } = {}): Promise<AuditRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500)
  const rows = await db
    .select({
      id: auditLog.id,
      actorId: auditLog.actorId,
      actorName: staff.name,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(staff, eq(auditLog.actorId, staff.id))
    .where(options.action ? sql`${auditLog.action} like ${`${options.action}%`}` : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
  return rows
}
