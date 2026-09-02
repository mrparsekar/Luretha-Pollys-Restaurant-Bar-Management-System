/**
 * Fixed-window counter, in memory. One outlet on one server, so a shared store
 * would be overkill - the real brute-force guard is the per-staff lockout in the
 * database. This just stops someone hammering the login endpoint in a loop.
 */
type Window = { count: number; resetAt: number }

const buckets = new Map<string, Window>()

let lastSweep = 0

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key)
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number }

export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  existing.count += 1
  if (existing.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) }
  }
  return { allowed: true, retryAfterSeconds: 0 }
}

export function reset(key: string): void {
  buckets.delete(key)
}

/** Tests need a clean slate between cases. */
export function resetAll(): void {
  buckets.clear()
}
