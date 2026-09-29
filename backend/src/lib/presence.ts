/**
 * How many staff are actively using the app right now, so the floor screen can
 * poll fast only when a collision is actually possible. In-memory only - it is
 * a hint for polling cadence, not an audit trail, and resets on deploy.
 */
const WINDOW_MS = 30_000
const seen = new Map<number, number>()

export function markSeen(staffId: number): void {
  seen.set(staffId, Date.now())
}

export function countActive(windowMs = WINDOW_MS): number {
  const cutoff = Date.now() - windowMs
  let count = 0
  for (const [id, at] of seen) {
    if (at < cutoff) seen.delete(id)
    else count += 1
  }
  return count
}
