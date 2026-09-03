import { useState } from 'react'
import type { ReactNode } from 'react'

import { AppShell } from '../../components/AppShell'
import { Badge, Button, ErrorNote, Field, Input, Sheet, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { plural, timeLabel } from '../../lib/format'
import { useAction, useAsync } from '../../lib/hooks'
import type { StaffMember } from '../../lib/types'

const digits = (text: string) => text.replace(/\D/g, '').slice(0, 6)

function isLocked(member: StaffMember): boolean {
  return member.lockedUntil !== null && new Date(member.lockedUntil).getTime() > Date.now()
}

/**
 * Waiters and their PINs. A PIN is never shown back - it is stored hashed, so the
 * only thing on offer here is setting a new one, which is also what you do when a
 * phone changes hands mid-season.
 */
export default function StaffManager(): ReactNode {
  const state = useAsync(() => api.staff.list(), [])
  const [editing, setEditing] = useState<StaffMember | null>(null)
  const [adding, setAdding] = useState(false)

  const staff = state.data?.staff ?? []
  const done = () => {
    setEditing(null)
    setAdding(false)
    state.reload()
  }

  return (
    <AppShell title="Staff" subtitle={plural(staff.filter((m) => m.isActive).length, 'active')}>
      {state.loading && !state.data ? <Spinner label="Loading staff" /> : null}
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}

      <ul className="mb-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {staff.map((member) => (
          <li key={member.id}>
            <button
              onClick={() => setEditing(member)}
              className="flex w-full items-center gap-3 p-3 text-left active:bg-slate-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{member.name}</span>
                <span className="block truncate text-xs text-slate-500">
                  {member.role === 'owner' ? 'Owner' : 'Waiter'}
                  {member.hasPin ? ' · PIN set' : member.hasPassword ? ' · password set' : ' · no way in yet'}
                  {member.openOrders > 0 ? ` · ${plural(member.openOrders, 'open tab')}` : ''}
                </span>
              </span>
              <span className="shrink-0">
                {!member.isActive ? <Badge tone="slate">off</Badge> : null}
                {isLocked(member) ? <Badge tone="red">locked</Badge> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Button size="lg" block onClick={() => setAdding(true)}>
        Add someone
      </Button>

      {editing ? <MemberSheet member={editing} onClose={() => setEditing(null)} onDone={done} /> : null}
      {adding ? <AddSheet onClose={() => setAdding(false)} onDone={done} /> : null}
    </AppShell>
  )
}

function MemberSheet({
  member,
  onClose,
  onDone,
}: {
  member: StaffMember
  onClose: () => void
  onDone: () => void
}): ReactNode {
  const [name, setName] = useState(member.name)
  const [email, setEmail] = useState(member.email ?? '')
  const [pin, setPin] = useState('')
  const [password, setPassword] = useState('')
  const action = useAction()

  const saveName = async () => {
    const result = await action.run(() =>
      api.staff.update(member.id, { name: name.trim(), email: email.trim() || null }),
    )
    if (result) onDone()
  }

  const savePin = async () => {
    const result = await action.run(() => api.staff.setPin(member.id, pin))
    if (result) onDone()
  }

  const savePassword = async () => {
    const result = await action.run(() => api.staff.setPassword(member.id, password))
    if (result) onDone()
  }

  const toggleActive = async () => {
    const result = await action.run(() =>
      api.staff.update(member.id, { isActive: !member.isActive }),
    )
    if (result) onDone()
  }

  const unlock = async () => {
    const result = await action.run(() => api.staff.unlock(member.id))
    if (result) onDone()
  }
  return (
    <Sheet open onClose={onClose} title={member.name}>
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      {isLocked(member) ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-800">
            Locked after too many wrong PINs, until {timeLabel(member.lockedUntil)}.
          </p>
          <Button variant="secondary" block className="mt-2" disabled={action.busy} onClick={unlock}>
            Unlock now
          </Button>
        </div>
      ) : null}

      <div className="mb-4 grid gap-3">
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
        </Field>
        <Field label="Email" hint={member.role === 'owner' ? 'Used to sign in.' : 'Optional.'}>
          <Input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            inputMode="email"
            maxLength={254}
          />
        </Field>
        <Button
          variant="secondary"
          disabled={action.busy || name.trim().length < 2}
          onClick={saveName}
        >
          Save details
        </Button>
      </div>

      <div className="mb-4 grid gap-2 border-t border-slate-200 pt-4">
        <Field label="New PIN" hint="4 to 6 digits. Tell them in person, not over WhatsApp.">
          <Input
            value={pin}
            onChange={(event) => setPin(digits(event.target.value))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="••••"
          />
        </Field>
        <Button variant="secondary" disabled={action.busy || pin.length < 4} onClick={savePin}>
          Set this PIN
        </Button>
      </div>
      {member.role === 'owner' ? (
        <div className="mb-4 grid gap-2 border-t border-slate-200 pt-4">
          <Field label="New password" hint="At least 8 characters.">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Button
            variant="secondary"
            disabled={action.busy || password.length < 8}
            onClick={savePassword}
          >
            Set this password
          </Button>
        </div>
      ) : null}

      <div className="border-t border-slate-200 pt-4">
        {member.isActive && member.openOrders > 0 ? (
          <p className="mb-2 text-xs text-amber-800">
            {plural(member.openOrders, 'tab')} still open on this person. Settle those first.
          </p>
        ) : null}
        <Button
          variant={member.isActive ? 'danger' : 'primary'}
          block
          disabled={action.busy}
          onClick={toggleActive}
        >
          {member.isActive ? 'Deactivate' : 'Bring back'}
        </Button>
        <p className="mt-2 text-xs text-slate-500">
          Deactivating stops them signing in. Their past orders and bills stay exactly as they are.
        </p>
      </div>
    </Sheet>
  )
}

function AddSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }): ReactNode {
  const [role, setRole] = useState<'waiter' | 'owner'>('waiter')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [password, setPassword] = useState('')
  const action = useAction()

  const ready =
    name.trim().length >= 2 && (role === 'waiter' ? pin.length >= 4 : password.length >= 8)

  const create = async () => {
    const result = await action.run(() =>
      api.staff.create({
        name: name.trim(),
        role,
        email: email.trim() || null,
        pin: role === 'waiter' ? pin : null,
        password: role === 'owner' ? password : null,
      }),
    )
    if (result) onDone()
  }

  return (
    <Sheet open onClose={onClose} title="Add someone">
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      <div className="mb-3 grid grid-cols-2 gap-2">
        {(['waiter', 'owner'] as const).map((option) => (
          <Button
            key={option}
            variant={role === option ? 'primary' : 'secondary'}
            onClick={() => setRole(option)}
          >
            {option === 'waiter' ? 'Waiter' : 'Owner'}
          </Button>
        ))}
      </div>
      <div className="grid gap-3">
        <Field label="Name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="As the guests hear it"
          />
        </Field>
        {role === 'waiter' ? (
          <Field label="PIN" hint="4 to 6 digits. This is how they sign in.">
            <Input
              value={pin}
              onChange={(event) => setPin(digits(event.target.value))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="••••"
            />
          </Field>
        ) : (
          <>
            <Field label="Email" hint="Used to sign in.">
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                inputMode="email"
                maxLength={254}
              />
            </Field>
            <Field label="Password" hint="At least 8 characters.">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
          </>
        )}
        <Button size="lg" block disabled={action.busy || !ready} onClick={create}>
          {action.busy ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </Sheet>
  )
}
