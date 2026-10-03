import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { PinDots, PinPad } from './PinPad'
import { Button, ErrorNote, Sheet, Spinner } from './ui'
import { api } from '../lib/api'
import { useAction, useAsync } from '../lib/hooks'
import type { LoginStaff } from '../lib/types'
import { useAuth } from '../state/auth'

/**
 * Handing the shared device to the next waiter without leaving the screen: pick
 * a name, key the PIN, done. Only a PIN gets you in here - the owner's password
 * login stays on the full login screen, since this is for a quick handoff.
 */
export function SwitchUserSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}): ReactNode {
  const { user, switchUser, signOut } = useAuth()
  const navigate = useNavigate()
  const staff = useAsync(
    (signal) => (open ? api.auth.loginStaff({ signal }) : Promise.resolve({ staff: [] })),
    [open],
  )
  const [picked, setPicked] = useState<LoginStaff | null>(null)
  const [pin, setPin] = useState('')
  const action = useAction()

  useEffect(() => {
    if (open) {
      setPicked(null)
      setPin('')
      action.clearError()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async () => {
    if (!picked || pin.length < 4) return
    const result = await action.run(() => api.auth.pin(picked.id, pin))
    setPin('')
    if (result) {
      switchUser(result.user)
      onClose()
    }
  }

  /** For closing the tab down for the night, or reaching the owner's password login. */
  const logOut = async () => {
    await signOut()
    onClose()
    navigate('/login', { replace: true })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Switch user">
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      {staff.loading ? <Spinner label="Loading staff" /> : null}
      {staff.error ? <ErrorNote message={staff.error.message} onRetry={staff.reload} /> : null}

      {picked ? (
        <div className="rounded-2xl bg-ink p-4 text-cream">
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
          <div className="mt-4 flex gap-3">
            <Button variant="secondary" block onClick={onClose}>
              Cancel
            </Button>
            <Button
              block
              className="bg-sand text-ink"
              disabled={pin.length < 4 || action.busy}
              onClick={submit}
            >
              {action.busy ? 'Checking…' : 'Done'}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          {user ? (
            <p className="mb-3 text-center text-sm text-slate-500">
              Signed in as <span className="font-semibold text-ink">{user.name}</span>
            </p>
          ) : null}
          <div className="grid gap-3">
            {(staff.data?.staff ?? []).map((member) => (
              <button
                key={member.id}
                onClick={() => {
                  setPicked(member)
                  action.clearError()
                }}
                className="flex min-h-14 items-center justify-between rounded-2xl border border-slate-300 bg-white px-4 text-left font-semibold active:bg-slate-100"
              >
                {member.name}
                <span className="text-xs font-normal uppercase tracking-wide text-slate-500">
                  {member.role}
                </span>
              </button>
            ))}
          </div>
          <Button variant="ghost" block className="mt-4" onClick={onClose}>
            Cancel
          </Button>
          <button
            onClick={logOut}
            className="mx-auto mt-2 block min-h-11 text-sm text-slate-500 underline"
          >
            Log out completely
          </button>
        </div>
      )}
    </Sheet>
  )
}
