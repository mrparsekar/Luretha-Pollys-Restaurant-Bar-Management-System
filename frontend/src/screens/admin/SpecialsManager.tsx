import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '../../components/AppShell'
import { Badge, Button, Empty, ErrorNote, Field, Input, Sheet, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { parseRupees, plural, rupees } from '../../lib/format'
import { useAction, useAsync } from '../../lib/hooks'
import type { SpecialItem } from '../../lib/types'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The QR page's board only has room to show this many before the text has to shrink past readable. */
const MAX_SPECIALS = 10

function scheduleLabel(item: Pick<SpecialItem, 'onDate' | 'daysOfWeek'>): string {
  if (item.onDate) return 'Just today'
  const days = item.daysOfWeek
  if (!days || days.length === 0 || days.length === 7) return 'Every day'
  return [...days].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(', ')
}

/** "Every day" as one tap, or pick specific weekdays it repeats on. */
function DayPicker({
  value,
  onChange,
}: {
  value: number[] | null
  onChange: (days: number[] | null) => void
}): ReactNode {
  const everyDay = !value || value.length === 0
  const toggle = (day: number) => {
    const current = value ?? []
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day]
    onChange(next.length === 0 ? null : next)
  }

  return (
    <div className="grid gap-2">
      <Button variant={everyDay ? 'primary' : 'secondary'} onClick={() => onChange(null)}>
        Every day
      </Button>
      <div className="grid grid-cols-7 gap-1">
        {DAY_LABELS.map((label, day) => (
          <button
            key={label}
            type="button"
            onClick={() => toggle(day)}
            className={`min-h-11 rounded-lg text-xs font-bold ${
              !everyDay && value!.includes(day)
                ? 'bg-ink text-cream'
                : 'bg-white text-slate-600 border border-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * What the owner picks for the table QR page: either a star against something
 * already on the menu, or a dish typed in fresh that isn't on the card at all.
 * A menu-sourced pick also surfaces as a pinned quick-pick tab when staff take
 * an order (see getMenu() on the backend), with the normal ask-for-price flow
 * if no price was set. Every special repeats daily by default - tap one to
 * pick specific weekdays instead. One QR for the whole restaurant: the
 * specials are the same no matter which table scanned it.
 */
export default function SpecialsManager(): ReactNode {
  const state = useAsync(() => api.specials.list(), [])
  const items = state.data?.items ?? []
  const [showQr, setShowQr] = useState(false)
  const [editing, setEditing] = useState<SpecialItem | null>(null)

  const reload = () => state.reload()

  return (
    <AppShell
      title="Today's Special"
      subtitle={`${plural(items.length, 'special')} in the plan`}
      action={
        <button
          onClick={() => setShowQr(true)}
          className="min-h-11 rounded-xl bg-sand px-3 py-2 text-xs font-bold text-ink active:bg-sand-deep"
        >
          QR code
        </button>
      }
    >
      {state.loading && !state.data ? <Spinner label="Loading specials" /> : null}
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}

      {state.data ? (
        <section className="mb-6">
          {items.length === 0 ? (
            <Empty title="Nothing picked yet" hint="Add from the menu or type one in below." />
          ) : (
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {items.map((item) => (
                <SpecialRow key={item.id} id={item.id} onRemoved={reload}>
                  <button
                    onClick={() => setEditing(item)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left active:opacity-70"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">{item.name}</span>
                        {item.source === 'custom' ? <Badge tone="amber">Custom</Badge> : null}
                      </span>
                      {item.description ? (
                        <span className="block truncate text-xs text-slate-500">{item.description}</span>
                      ) : null}
                      <span className="block text-xs text-slate-400">{scheduleLabel(item)}</span>
                    </span>
                    {item.pricePaise !== null ? (
                      <span className="tnum shrink-0 text-sm font-semibold">{rupees(item.pricePaise)}</span>
                    ) : item.source === 'custom' ? (
                      <Badge tone="blue">Ask price</Badge>
                    ) : null}
                  </button>
                </SpecialRow>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {items.length >= MAX_SPECIALS ? (
        <p className="mb-6 rounded-2xl border border-slate-200 bg-white p-3 text-center text-xs font-semibold text-slate-500">
          Maximum of {MAX_SPECIALS} specials reached - remove one to add another.
        </p>
      ) : (
        <>
          <AddFromMenu onAdded={reload} />
          <AddCustom onAdded={reload} />
        </>
      )}

      <p className="mt-6 text-center">
        <Link to="/admin/specials/history" className="text-xs font-semibold underline text-slate-500">
          See what was special on a past day
        </Link>
      </p>

      {showQr ? <QrSheet onClose={() => setShowQr(false)} /> : null}
      {editing ? (
        <EditSpecial
          key={editing.id}
          item={editing}
          onClose={() => {
            setEditing(null)
            reload()
          }}
        />
      ) : null}
    </AppShell>
  )
}

function QrSheet({ onClose }: { onClose: () => void }): ReactNode {
  const state = useAsync(() => api.specials.qr(), [])

  return (
    <Sheet open onClose={onClose} title="Table QR code">
      {state.loading ? <Spinner label="Building the QR" /> : null}
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}
      {state.data ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4">
          <img src={state.data.dataUrl} alt="QR code for today's special" className="size-48" />
          <p className="break-all text-center text-xs text-slate-500">{state.data.url}</p>
          <p className="text-center text-xs text-slate-500">
            Same code for every table - print a copy for each one. Scanning it opens today&apos;s
            special.
          </p>
        </div>
      ) : null}
    </Sheet>
  )
}

function SpecialRow({
  id,
  onRemoved,
  children,
}: {
  id: number
  onRemoved: () => void
  children: ReactNode
}): ReactNode {
  const action = useAction()

  const remove = async () => {
    if (await action.run(() => api.specials.remove(id))) onRemoved()
  }

  return (
    <li className="flex items-center gap-3 p-3">
      {children}
      <button
        onClick={remove}
        disabled={action.busy}
        aria-label="Remove special"
        className="min-h-11 shrink-0 px-2 text-lg text-nonveg"
      >
        ×
      </button>
    </li>
  )
}

/** Type a few letters, tap one, done - the same quick pattern as the order pad's search. */
function AddFromMenu({ onAdded }: { onAdded: () => void }): ReactNode {
  const menu = useAsync(() => api.menu.get(), [])
  const [query, setQuery] = useState('')
  const action = useAction()

  const results = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text || !menu.data) return []
    const hits = menu.data.menu
      .flatMap((category) => category.items)
      .filter((item) => item.name.toLowerCase().includes(text))
    return hits.slice(0, 20)
  }, [query, menu.data])

  const add = async (menuItemId: number) => {
    if (await action.run(() => api.specials.addMenuItem(menuItemId))) {
      setQuery('')
      onAdded()
    }
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        Add from the menu
      </h2>
      <p className="mb-2 text-xs text-slate-500">Added for just today - tap it afterwards to make it repeat.</p>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search the menu"
        inputMode="search"
      />
      {action.error ? (
        <div className="mt-2">
          <ErrorNote message={action.error} />
        </div>
      ) : null}
      {results.length > 0 ? (
        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {results.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => add(item.id)}
                disabled={action.busy}
                className="flex w-full items-center gap-3 p-3 text-left active:bg-slate-50"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
                <span className="shrink-0 text-sm font-semibold text-ink">+ Add</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/**
 * One sheet for every special: the schedule is always editable - a one-off
 * just shows which day it was for, and picking "Every day" or specific
 * weekdays below turns it into a repeat (one-way: there is no going back to a
 * one-off once it repeats). A custom-typed one (its item lives under the
 * reserved Specials category) also exposes name/description/price/veg, since
 * nowhere else can edit those.
 */
function EditSpecial({ item, onClose }: { item: SpecialItem; onClose: () => void }): ReactNode {
  const isCustom = item.source === 'custom'
  const [name, setName] = useState(item.name)
  const [description, setDescription] = useState(item.description ?? '')
  const [price, setPrice] = useState(item.pricePaise === null ? '' : String(item.pricePaise / 100))
  const [veg, setVeg] = useState<'veg' | 'nonveg' | 'either'>(
    item.isVeg === null ? 'either' : item.isVeg ? 'veg' : 'nonveg',
  )
  const [days, setDays] = useState<number[] | null>(item.daysOfWeek)
  const [daysChanged, setDaysChanged] = useState(false)
  const action = useAction()

  const priceOk = price.trim() === '' || parseRupees(price) !== null
  const ready = (!isCustom || name.trim().length > 0) && priceOk

  const changeDays = (next: number[] | null) => {
    setDays(next)
    setDaysChanged(true)
  }

  const save = async () => {
    if (!ready) return
    if (isCustom) {
      const hasPrice = price.trim() !== ''
      const ok = await action.run(() =>
        api.menu.updateItem(item.menuItemId, {
          name: name.trim(),
          description: description.trim() || null,
          priceMode: hasPrice ? 'fixed' : 'ask',
          basePricePaise: hasPrice ? parseRupees(price) : null,
          isVeg: veg === 'either' ? null : veg === 'veg',
        }),
      )
      if (!ok) return
    }
    if (daysChanged) {
      if (!(await action.run(() => api.specials.updateDays(item.id, days)))) return
    }
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={item.name}>
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}
      <div className="grid gap-3">
        {isCustom ? (
          <>
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
            </Field>
            <Field label="Description" hint="Optional.">
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={300}
              />
            </Field>
            <Field label="Price ₹" hint="Leave blank to ask the guest's table at order time.">
              <Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" />
            </Field>
            {!priceOk ? <p className="text-xs font-semibold text-nonveg">That price is not a number.</p> : null}
            <Field label="Veg or not">
              <div className="grid grid-cols-3 gap-2">
                {(['veg', 'nonveg', 'either'] as const).map((option) => (
                  <Button
                    key={option}
                    variant={veg === option ? 'primary' : 'secondary'}
                    onClick={() => setVeg(option)}
                  >
                    {option === 'veg' ? 'Veg' : option === 'nonveg' ? 'Non-veg' : 'Neither'}
                  </Button>
                ))}
              </div>
            </Field>
          </>
        ) : null}
        <Field
          label="Repeats on"
          hint={item.onDate && !daysChanged ? 'Just for today right now - pick below to make it repeat.' : undefined}
        >
          <DayPicker value={days} onChange={changeDays} />
        </Field>
        <Button size="lg" disabled={action.busy || !ready} onClick={save}>
          {action.busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Sheet>
  )
}

/** For the dish that isn't on the regular menu at all - no price is fine too. */
function AddCustom({ onAdded }: { onAdded: () => void }): ReactNode {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [veg, setVeg] = useState<'veg' | 'nonveg' | 'either'>('either')
  const action = useAction()

  const priceOk = price.trim() === '' || parseRupees(price) !== null
  const ready = name.trim().length > 0 && priceOk

  const add = async () => {
    if (!ready) return
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      pricePaise: price.trim() === '' ? null : parseRupees(price),
      isVeg: veg === 'either' ? null : veg === 'veg',
    }
    if (await action.run(() => api.specials.addCustom(body))) {
      setName('')
      setDescription('')
      setPrice('')
      setVeg('either')
      onAdded()
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        Add something not on the menu
      </h2>
      <p className="mb-2 text-xs text-slate-500">Added for just today - tap it afterwards to make it repeat.</p>
      {action.error ? (
        <div className="mb-2">
          <ErrorNote message={action.error} />
        </div>
      ) : null}
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3">
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
        </Field>
        <Field label="Description" hint="Optional.">
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={300}
          />
        </Field>
        <Field label="Price ₹" hint="Optional - leave blank to ask the guest's table at order time.">
          <Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" />
        </Field>
        {!priceOk ? <p className="text-xs font-semibold text-nonveg">That price is not a number.</p> : null}
        <Field label="Veg or not">
          <div className="grid grid-cols-3 gap-2">
            {(['veg', 'nonveg', 'either'] as const).map((option) => (
              <Button
                key={option}
                variant={veg === option ? 'primary' : 'secondary'}
                onClick={() => setVeg(option)}
              >
                {option === 'veg' ? 'Veg' : option === 'nonveg' ? 'Non-veg' : 'Neither'}
              </Button>
            ))}
          </div>
        </Field>
        <Button size="lg" disabled={action.busy || !ready} onClick={add}>
          {action.busy ? 'Adding…' : 'Add to the list'}
        </Button>
      </div>
    </section>
  )
}
