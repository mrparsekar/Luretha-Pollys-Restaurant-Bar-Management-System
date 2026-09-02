import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { PinDots, PinPad } from '../components/PinPad'
import { Button, ErrorNote, Field, Input, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useAction, useAsync } from '../lib/hooks'
import type { LoginStaff, User } from '../lib/types'
import { useAuth } from '../state/auth'

/**
 * Waiters tap their name and key a PIN; the owner has an email and password as
 * well, because a password is the thing you can safely type on a laptop.
 */
export default function Login(): ReactNode {
  const { user, booting, signedIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const staff = useAsync(() => api.auth.loginStaff(), [])
  const action = useAction()

  const [mode, setMode] = useState<'pin' | 'owner'>('pin')
  const [picked, setPicked] = useState<LoginStaff | null>(null)
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (booting) return <Spinner label="Loading" />
  if (user) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />
  }

  const finish = (next: { user: User } | null) => {
    if (!next) return
    signedIn(next.user)
    navigate('/', { replace: true })
  }

  const submitPin = async () => {
    if (!picked || pin.length < 4) return
    const result = await action.run(() => api.auth.pin(picked.id, pin))
    setPin('')
    finish(result)
  }

  const submitOwner = async (event: FormEvent) => {
    event.preventDefault()
    finish(await action.run(() => api.auth.owner(email, password)))
  }

  return (
    <div className="safe-top safe-bottom flex min-h-dvh flex-col bg-ink px-5 py-8 text-cream">
      <header className="mb-6 text-center">
        <p className="text-2xl font-bold tracking-tight">Luretha &amp; Pollys</p>
        <p className="text-xs uppercase tracking-[0.2em] text-sand">Bar &amp; Restaurant</p>
      </header>

      <div className="mx-auto w-full max-w-sm flex-1">
        {action.error ? (
          <div className="mb-4">
            <ErrorNote message={action.error} />
          </div>
        ) : null}

        {mode === 'owner' ? (
          <form onSubmit={submitOwner} className="space-y-4">
            <div className="[&_span]:text-cream/60">
              <Field label="Email">
                <Input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Field>
            </div>
            <div className="[&_span]:text-cream/60">
              <Field label="Password">
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </Field>
            </div>
            <Button type="submit" size="lg" block disabled={action.busy} className="bg-sand text-ink">
              {action.busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        ) : picked ? (
          <div>
            <button
              onClick={() => {
                setPicked(null)
                setPin('')
                action.clearError()
              }}
              className="mb-2 min-h-11 text-sm text-cream/70"
            >
              ‹ Not {picked.name}
            </button>
            <p className="text-center text-lg font-semibold">{picked.name}</p>
            <PinDots length={pin.length} />
            <PinPad value={pin} onChange={setPin} disabled={action.busy} />
            <Button
              size="lg"
              block
              className="mt-4 bg-sand text-ink"
              disabled={pin.length < 4 || action.busy}
              onClick={submitPin}
            >
              {action.busy ? 'Checking…' : 'Sign in'}
            </Button>
          </div>
        ) : (
          <div>
            <p className="mb-3 text-sm text-cream/70">Tap your name</p>
            {staff.loading ? <Spinner label="Loading staff" /> : null}
            {staff.error ? <ErrorNote message={staff.error.message} onRetry={staff.reload} /> : null}
            <div className="grid gap-3">
              {(staff.data?.staff ?? []).map((member) => (
                <button
                  key={member.id}
                  onClick={() => {
                    setPicked(member)
                    action.clearError()
                  }}
                  className="flex min-h-14 items-center justify-between rounded-2xl bg-white/10 px-4 text-left font-semibold active:bg-white/25"
                >
                  {member.name}
                  <span className="text-xs font-normal uppercase tracking-wide text-cream/60">
                    {member.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => {
          setMode(mode === 'owner' ? 'pin' : 'owner')
          setPicked(null)
          setPin('')
          action.clearError()
        }}
        className="mx-auto mt-6 min-h-11 text-sm text-cream/60 underline"
      >
        {mode === 'owner' ? 'Staff PIN sign in' : 'Owner sign in with password'}
      </button>
    </div>
  )
}
