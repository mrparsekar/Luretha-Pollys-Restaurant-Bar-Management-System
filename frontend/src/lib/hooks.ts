import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError } from './api'

export type AsyncState<T> = {
  data: T | null
  error: ApiError | null
  loading: boolean
  /** Refetch by hand, e.g. after a write. */
  reload: () => void
}

/**
 * One fetch, cancelled if the screen goes away. `deps` behaves like a
 * useEffect dependency list: change it and the call is made again.
 */
export function useAsync<T>(
  run: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[] = [],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  // Keeping the callback in a ref lets deps stay the caller's business.
  const latest = useRef(run)
  latest.current = run

  useEffect(() => {
    const controller = new AbortController()
    let live = true
    setLoading(true)

    latest
      .current(controller.signal)
      .then((value) => {
        if (!live) return
        setData(value)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (!live || controller.signal.aborted) return
        setError(
          cause instanceof ApiError ? cause : new ApiError(0, 'error', 'Something went wrong.'),
        )
      })
      .finally(() => {
        if (live) setLoading(false)
      })

    return () => {
      live = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, error, loading, reload }
}

/**
 * Same as useAsync but re-runs on a timer, and pauses while the tab is hidden so
 * a phone in a pocket is not polling the API all evening. Used by the floor
 * board, the owner's live board and the kitchen screen.
 */
export function usePoll<T>(
  run: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  deps: readonly unknown[] = [],
): AsyncState<T> {
  const state = useAsync(run, deps)
  const reload = state.reload

  useEffect(() => {
    let timer: number | undefined

    const tick = () => {
      if (document.visibilityState === 'visible') reload()
    }
    const start = () => {
      window.clearInterval(timer)
      timer = window.setInterval(tick, intervalMs)
    }

    // Coming back to the app should show fresh numbers immediately.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        reload()
        start()
      } else {
        window.clearInterval(timer)
      }
    }

    start()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs, reload])

  return state
}

/** Tracks an in-flight write so a button can disable itself and show its error. */
export function useAction(): {
  busy: boolean
  error: string | null
  clearError: () => void
  run: <T>(task: () => Promise<T>) => Promise<T | null>
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T | null> => {
    setBusy(true)
    setError(null)
    try {
      return await task()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.')
      return null
    } finally {
      setBusy(false)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])
  return { busy, error, clearError, run }
}

/** Re-renders on a timer so "12m ago" labels keep counting without a refetch. */
export function useTicker(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(timer)
  }, [everyMs])
  return now
}

/** Survives a reload, so a half-built round is not lost if the phone locks. */
export function useStoredState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })

  const store = useCallback(
    (next: T) => {
      setValue(next)
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // A full or private-mode storage is not worth breaking the order over.
      }
    },
    [key],
  )

  return [value, store]
}
