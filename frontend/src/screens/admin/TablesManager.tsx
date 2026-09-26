import { useState } from 'react'
import type { ReactNode } from 'react'

import { AppShell } from '../../components/AppShell'
import { Badge, Button, ErrorNote, Field, Input, Sheet, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { plural } from '../../lib/format'
import { useAction, useAsync } from '../../lib/hooks'
import type { DiningTable, Section } from '../../lib/types'

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'indoor', label: 'Indoor' },
  { key: 'bar', label: 'Bar' },
  { key: 'garden', label: 'Garden' },
  { key: 'beach', label: 'Beach' },
]

/**
 * The owner's floor plan: add a table, rename or reseat one, retire what's no
 * longer used. Retiring keeps the row - past orders still point at it - it just
 * stops showing up for a waiter to open a tab against.
 */
export default function TablesManager(): ReactNode {
  const state = useAsync(() => api.tables.list(true), [])
  const [editing, setEditing] = useState<DiningTable | null>(null)
  const [adding, setAdding] = useState(false)

  const tables = state.data?.tables ?? []
  const active = tables.filter((table) => table.isActive)

  const done = () => {
    setEditing(null)
    setAdding(false)
    state.reload()
  }

  return (
    <AppShell title="Tables" subtitle={`${plural(active.length, 'table')} on the floor`}>
      {state.loading && !state.data ? <Spinner label="Loading tables" /> : null}
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}

      <div className="space-y-6">
        {SECTIONS.map(({ key, label }) => {
          const list = tables.filter((table) => table.section === key)
          if (list.length === 0) return null
          return (
            <section key={key}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                {label}
              </h2>
              <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {list.map((table) => (
                  <li key={table.id}>
                    <button
                      onClick={() => setEditing(table)}
                      className="flex w-full items-center gap-3 p-3 text-left active:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{table.label}</span>
                        <span className="block text-xs text-slate-500">
                          {plural(table.seats, 'seat')}
                          {!table.isActive ? ' · retired' : ''}
                        </span>
                      </span>
                      {!table.isActive ? <Badge tone="slate">Retired</Badge> : null}
                      <span aria-hidden className="shrink-0 text-slate-400">
                        ›
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <Button size="lg" block className="mt-4" onClick={() => setAdding(true)}>
        Add a table
      </Button>

      {editing ? <TableEditor key={editing.id} table={editing} onClose={done} /> : null}
      {adding ? <AddTable onClose={done} /> : null}
    </AppShell>
  )
}

function TableEditor({ table, onClose }: { table: DiningTable; onClose: () => void }): ReactNode {
  const [label, setLabel] = useState(table.label)
  const [section, setSection] = useState<Section>(table.section)
  const [seats, setSeats] = useState(String(table.seats))
  const action = useAction()

  const seatsOk = /^[1-9][0-9]*$/.test(seats.trim())
  const ready = label.trim().length > 0 && seatsOk

  const save = async () => {
    if (!ready) return
    if (
      await action.run(() =>
        api.tables.update(table.id, { label: label.trim(), section, seats: Number(seats) }),
      )
    ) {
      onClose()
    }
  }

  const toggleActive = async () => {
    if (await action.run(() => api.tables.update(table.id, { isActive: !table.isActive }))) {
      onClose()
    }
  }

  return (
    <Sheet open onClose={onClose} title={table.label}>
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      <div className="grid gap-3">
        <Field label="Label">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={30} />
        </Field>

        <Field label="Section">
          <select
            value={section}
            onChange={(event) => setSection(event.target.value as Section)}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base"
          >
            {SECTIONS.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Seats">
          <Input value={seats} onChange={(event) => setSeats(event.target.value)} inputMode="numeric" />
        </Field>
        {!seatsOk ? <p className="text-xs font-semibold text-nonveg">Seats must be a whole number.</p> : null}
      </div>

      <Button size="lg" block className="mt-4" disabled={action.busy || !ready} onClick={save}>
        {action.busy ? 'Saving…' : 'Save table'}
      </Button>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <Button
          variant={table.isActive ? 'danger' : 'primary'}
          block
          disabled={action.busy}
          onClick={toggleActive}
        >
          {table.isActive ? 'Retire this table' : 'Bring back on the floor'}
        </Button>
        {table.isActive ? (
          <p className="mt-2 text-xs text-slate-500">
            Blocked while an order is running on it. Nothing is deleted - past orders keep this
            table on the bill.
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}

function AddTable({ onClose }: { onClose: () => void }): ReactNode {
  const [label, setLabel] = useState('')
  const [section, setSection] = useState<Section>('indoor')
  const [seats, setSeats] = useState('4')
  const action = useAction()

  const seatsOk = /^[1-9][0-9]*$/.test(seats.trim())
  const ready = label.trim().length > 0 && seatsOk

  const create = async () => {
    if (!ready) return
    if (
      await action.run(() =>
        api.tables.create({ label: label.trim(), section, seats: Number(seats) }),
      )
    ) {
      onClose()
    }
  }

  return (
    <Sheet open onClose={onClose} title="Add a table">
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      <div className="grid gap-3">
        <Field label="Label">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="T10"
            maxLength={30}
          />
        </Field>

        <Field label="Section">
          <select
            value={section}
            onChange={(event) => setSection(event.target.value as Section)}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base"
          >
            {SECTIONS.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Seats">
          <Input value={seats} onChange={(event) => setSeats(event.target.value)} inputMode="numeric" />
        </Field>
        {!seatsOk ? <p className="text-xs font-semibold text-nonveg">Seats must be a whole number.</p> : null}

        <Button size="lg" block disabled={action.busy || !ready} onClick={create}>
          {action.busy ? 'Adding…' : 'Add to the floor'}
        </Button>
      </div>
    </Sheet>
  )
}
