import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { api, setUnauthorisedHandler } from '../lib/api'
import type { Settings, User } from '../lib/types'

type AuthValue = {
  user: User | null
  settings: Settings | null
  /** True until the first /auth/me answers, so routes do not flash the login screen. */
  booting: boolean
  isOwner: boolean
  signedIn: (user: User) => void
  signOut: () => Promise<void>
  refreshSettings: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

/**
 * The session lives in an httpOnly cookie the JavaScript cannot read, so the app
 * asks the API who it is on boot. /auth/me answers 200 with a null user when
 * signed out, which keeps that a single request rather than a handled 401.
 */
export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [user, setUser] = useState<User | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [booting, setBooting] = useState(true)
  const [settingsNonce, setSettingsNonce] = useState(0)

  useEffect(() => {
    let live = true
    api.auth
      .me()
      .then((result) => {
        if (live) setUser(result.user)
      })
      .catch(() => {
        if (live) setUser(null)
      })
      .finally(() => {
        if (live) setBooting(false)
      })
    return () => {
      live = false
    }
  }, [])

  // Every screen shows the restaurant name and needs the tax flags for the bill.
  useEffect(() => {
    if (!user) {
      setSettings(null)
      return
    }
    let live = true
    api.settings
      .get()
      .then((result) => {
        if (live) setSettings(result.settings)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [user, settingsNonce])

  const signedIn = useCallback((next: User) => setUser(next), [])

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      setUser(null)
      // A stale half-built round belongs to the person who just left.
      try {
        for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith('lp.round.')) window.localStorage.removeItem(key)
        }
      } catch {
        // Nothing to do if storage is unavailable.
      }
    }
  }, [])

  // Any 401 from anywhere means the 12h session expired mid-shift.
  useEffect(() => {
    setUnauthorisedHandler(() => setUser(null))
    return () => setUnauthorisedHandler(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      settings,
      booting,
      isOwner: user?.role === 'owner',
      signedIn,
      signOut,
      refreshSettings: () => setSettingsNonce((n) => n + 1),
    }),
    [user, settings, booting, signedIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
