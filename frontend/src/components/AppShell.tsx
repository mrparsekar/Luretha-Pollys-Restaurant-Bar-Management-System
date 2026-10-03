import { useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { SwitchUserSheet } from './SwitchUserSheet'
import { useAuth } from '../state/auth'

/* The chrome around every signed-in screen: a thin header that says where you
 * are and who you are, and a thumb-height nav bar pinned to the bottom. */

type NavItem = { to: string; label: string; icon: string }

const WAITER_NAV: NavItem[] = [
  { to: '/floor', label: 'Floor', icon: '▦' },
  { to: '/orders', label: 'Orders', icon: '☰' },
]

const OWNER_NAV: NavItem[] = [
  { to: '/admin', label: 'Board', icon: '◉' },
  { to: '/floor', label: 'Floor', icon: '▦' },
  { to: '/admin/reports', label: 'Reports', icon: '▤' },
  { to: '/admin/more', label: 'More', icon: '⋯' },
]

export function AppShell({
  title,
  subtitle,
  action,
  children,
}: {
  title?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}): ReactNode {
  const { user, settings, isOwner } = useAuth()
  const items = isOwner ? OWNER_NAV : WAITER_NAV
  const [switching, setSwitching] = useState(false)

  return (
    <div className="min-h-dvh bg-cream pb-20">
      <header className="safe-top no-print sticky top-0 z-20 border-b border-ink-soft bg-ink text-cream">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 lg:max-w-5xl lg:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {title ?? settings?.restaurantName ?? 'Luretha & Pollys'}
            </p>
            <p className="truncate text-xs text-cream/70">
              {subtitle ?? `${user?.name ?? ''}${isOwner ? ' · owner' : ' · waiter'}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {action}
            <button
              onClick={() => setSwitching(true)}
              className="flex min-h-11 flex-col items-end justify-center rounded-xl px-3 leading-tight active:bg-ink-soft"
            >
              <span className="truncate text-xs font-semibold text-cream">{user?.name}</span>
              <span className="text-xs font-semibold text-cream/80">Switch user</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4 lg:max-w-5xl lg:px-6">{children}</main>

      <nav className="safe-bottom no-print fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl lg:max-w-5xl">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin'}
              className={({ isActive }) =>
                `flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                  isActive ? 'text-ink' : 'text-slate-400'
                }`
              }
            >
              <span aria-hidden className="text-lg leading-none">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <SwitchUserSheet open={switching} onClose={() => setSwitching(false)} />
    </div>
  )
}

/** Screens that fill the viewport themselves (login, bill). */
export function Bare({ children }: { children: ReactNode }): ReactNode {
  return <div className="min-h-dvh bg-cream">{children}</div>
}
