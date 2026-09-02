import { useState } from 'react'
import type { ReactNode } from 'react'

import { AppShell } from '../../components/AppShell'
import { Badge, Button, ErrorNote, Field, Input, Sheet, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { parseRupees, plural, rupees } from '../../lib/format'
import { useAction, useAsync } from '../../lib/hooks'
import type { MenuCategory, MenuItem, MenuVariant } from '../../lib/types'

/** What the price column says, including the two "no price yet" cases. */
function priceLabel(item: MenuItem): string {
  if (item.priceMode === 'ask') return 'Ask'
  if (item.priceMode === 'variant') {
    const prices = item.variants
      .map((variant) => variant.pricePaise)
      .filter((value): value is number => value !== null)
    if (prices.length === 0) return 'No prices'
    const low = Math.min(...prices)
    const high = Math.max(...prices)
    return low === high ? rupees(low) : `${rupees(low)}–${rupees(high)}`
  }
  return item.basePricePaise === null ? 'No price' : rupees(item.basePricePaise)
}

/**
 * The menu manager. Prices here only affect orders taken from now on: every line
 * already on a tab keeps the price it was sold at, which is why the bill of a
 * settled order never moves when the owner edits this screen.
 */
export default function MenuManager(): ReactNode {
  const state = useAsync(() => api.menu.get(), [])
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [adding, setAdding] = useState(false)

  const menu = state.data?.menu ?? []
  const current = menu.find((entry) => entry.id === categoryId) ?? menu[0] ?? null
  const term = query.trim().toLowerCase()
  const items = term
    ? menu
        .flatMap((entry) => entry.items)
        .filter((item) => item.name.toLowerCase().includes(term))
        .slice(0, 60)
    : (current?.items ?? [])

  const done = () => {
    setEditing(null)
    setAdding(false)
    state.reload()
  }
  return (
    <AppShell title="Menu" subtitle={`${plural(menu.length, 'section')} on the card`}>
      {state.loading && !state.data ? <Spinner label="Loading the menu" /> : null}
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search the whole menu"
        className="mb-3"
      />

      {!term ? (
        <select
          value={current?.id ?? ''}
          onChange={(event) => setCategoryId(Number(event.target.value))}
          className="mb-3 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base"
        >
          {menu.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} ({entry.items.length})
            </option>
          ))}
        </select>
      ) : null}

      <ul className="mb-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {items.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => setEditing(item)}
              className="flex w-full items-center gap-3 p-3 text-left active:bg-slate-50"
            >
              <span
                aria-hidden
                className={`mt-1 size-3 shrink-0 rounded-sm border-2 ${
                  item.isVeg === null
                    ? 'border-slate-300'
                    : item.isVeg
                      ? 'border-veg'
                      : 'border-nonveg'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.name}</span>
                <span className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                  {priceLabel(item)}
                  {!item.available ? <Badge tone="red">86</Badge> : null}
                  {item.windowLabel ? <Badge tone="amber">{item.windowLabel}</Badge> : null}
                  {item.priceMode === 'variant' ? (
                    <Badge tone="slate">{plural(item.variants.length, 'size')}</Badge>
                  ) : null}
                </span>
              </span>
              <span aria-hidden className="shrink-0 text-slate-400">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Button size="lg" block onClick={() => setAdding(true)}>
        Add an item
      </Button>

      {editing ? <ItemEditor key={editing.id} item={editing} onClose={done} /> : null}
      {adding ? <AddItem categories={menu} onClose={done} /> : null}
    </AppShell>
  )
}

/**
 * One item. Variants save one at a time without closing the sheet - a spirit at
 * 30ml and 60ml is two prices, and it would be silly to reopen this in between.
 */
function ItemEditor({ item, onClose }: { item: MenuItem; onClose: () => void }): ReactNode {
  const [name, setName] = useState(item.name)
  const [mode, setMode] = useState(item.priceMode)
  const [price, setPrice] = useState(
    item.basePricePaise === null ? '' : String(item.basePricePaise / 100),
  )
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [confirming, setConfirming] = useState(false)
  const action = useAction()

  const priceOk = mode !== 'fixed' || price.trim() === '' || parseRupees(price) !== null
  const clockOk = [from, to].every((value) => value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value))

  const save = async () => {
    const body: Record<string, unknown> = { name: name.trim(), priceMode: mode }
    if (mode === 'variant') body.basePricePaise = null
    else if (mode === 'ask') body.basePricePaise = null
    else body.basePricePaise = price.trim() === '' ? null : parseRupees(price)
    if (from && to) {
      body.availFrom = from
      body.availTo = to
    }
    if (await action.run(() => api.menu.updateItem(item.id, body))) onClose()
  }

  const patch = async (body: Record<string, unknown>) => {
    if (await action.run(() => api.menu.updateItem(item.id, body))) onClose()
  }

  const remove = async () => {
    if (await action.run(() => api.menu.deleteItem(item.id))) onClose()
  }
  return (
    <Sheet open onClose={onClose} title={item.name}>
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      <Button
        variant={item.available ? 'danger' : 'primary'}
        block
        className="mb-4"
        disabled={action.busy}
        onClick={() => patch({ available: !item.available })}
      >
        {item.available ? 'Mark 86 · off the menu' : 'Back on the menu'}
      </Button>

      <div className="grid gap-3">
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
        </Field>

        <Field label="How it is priced">
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as MenuItem['priceMode'])}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base"
          >
            <option value="fixed">One price</option>
            <option value="variant">Sizes or types</option>
            <option value="ask">Ask at the table</option>
          </select>
        </Field>

        {mode === 'fixed' ? (
          <Field label="Price ₹" hint="Leave blank if it has no price yet.">
            <Input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              inputMode="decimal"
            />
          </Field>
        ) : null}
        {!priceOk ? <p className="text-xs font-semibold text-nonveg">That price is not a number.</p> : null}
      </div>
      {mode === 'variant' ? (
        <section className="mt-4 border-t border-slate-200 pt-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Sizes and prices
          </h3>
          <div className="grid gap-2">
            {item.variants.map((variant) => (
              <VariantRow key={variant.id} variant={variant} />
            ))}
            <NewVariant itemId={item.id} onAdded={onClose} />
          </div>
        </section>
      ) : null}

      <section className="mt-4 border-t border-slate-200 pt-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          When it is served
        </h3>
        <p className="mb-2 text-xs text-slate-500">
          {item.windowLabel ? `Now: ${item.windowLabel}` : 'All day.'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="From">
            <Input
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              placeholder="19:00"
              maxLength={5}
            />
          </Field>
          <Field label="To">
            <Input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="22:00"
              maxLength={5}
            />
          </Field>
        </div>
        {!clockOk ? (
          <p className="mt-1 text-xs font-semibold text-nonveg">Use HH:MM, e.g. 19:00.</p>
        ) : null}
        {item.windowLabel ? (
          <Button
            variant="secondary"
            block
            className="mt-2"
            disabled={action.busy}
            onClick={() => patch({ availFrom: null, availTo: null })}
          >
            Serve it all day
          </Button>
        ) : null}
      </section>
      <Button
        size="lg"
        block
        className="mt-4"
        disabled={action.busy || !priceOk || !clockOk || name.trim().length === 0}
        onClick={save}
      >
        {action.busy ? 'Saving…' : 'Save item'}
      </Button>

      <div className="mt-4 border-t border-slate-200 pt-4">
        {confirming ? (
          <>
            <p className="mb-2 text-xs text-slate-600">
              Past orders keep this item exactly as it was sold. Remove it from the card?
            </p>
            <Button variant="danger" block disabled={action.busy} onClick={remove}>
              Yes, remove it
            </Button>
          </>
        ) : (
          <Button variant="ghost" block className="text-nonveg" onClick={() => setConfirming(true)}>
            Remove from the menu
          </Button>
        )}
      </div>
    </Sheet>
  )
}

function VariantRow({ variant }: { variant: MenuVariant }): ReactNode {
  const [price, setPrice] = useState(
    variant.pricePaise === null ? '' : String(variant.pricePaise / 100),
  )
  const [status, setStatus] = useState<'idle' | 'saved' | 'gone'>('idle')
  const action = useAction()

  const parsed = price.trim() === '' ? null : parseRupees(price)
  const ok = price.trim() === '' || parsed !== null

  const save = async () => {
    if (!ok) return
    if (await action.run(() => api.menu.updateVariant(variant.id, { pricePaise: parsed }))) {
      setStatus('saved')
    }
  }

  const remove = async () => {
    if (await action.run(() => api.menu.deleteVariant(variant.id))) setStatus('gone')
  }

  if (status === 'gone') return null

  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{variant.label}</span>
      <Input
        value={price}
        onChange={(event) => {
          setPrice(event.target.value)
          setStatus('idle')
        }}
        inputMode="decimal"
        aria-label={`${variant.label} price`}
        className="w-24 shrink-0 text-right"
      />
      <Button variant="secondary" disabled={action.busy || !ok} onClick={save} className="shrink-0">
        {status === 'saved' ? '✓' : 'Save'}
      </Button>
      <button
        onClick={remove}
        disabled={action.busy}
        aria-label={`Remove ${variant.label}`}
        className="min-h-11 shrink-0 px-2 text-lg text-nonveg"
      >
        ×
      </button>
    </div>
  )
}

function NewVariant({ itemId, onAdded }: { itemId: number; onAdded: () => void }): ReactNode {
  const [label, setLabel] = useState('')
  const [price, setPrice] = useState('')
  const action = useAction()

  const parsed = price.trim() === '' ? null : parseRupees(price)
  const ok = label.trim().length > 0 && (price.trim() === '' || parsed !== null)

  const add = async () => {
    if (!ok) return
    if (await action.run(() => api.menu.addVariant(itemId, { label: label.trim(), pricePaise: parsed }))) {
      onAdded()
    }
  }

  return (
    <div className="flex items-center gap-2 border-t border-dashed border-slate-300 pt-2">
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="60ml"
        aria-label="New size"
        className="min-w-0 flex-1"
      />
      <Input
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        inputMode="decimal"
        placeholder="₹"
        aria-label="New size price"
        className="w-24 shrink-0 text-right"
      />
      <Button disabled={action.busy || !ok} onClick={add} className="shrink-0">
        Add
      </Button>
    </div>
  )
}

function AddItem({
  categories,
  onClose,
}: {
  categories: MenuCategory[]
  onClose: () => void
}): ReactNode {
  const [categoryId, setCategoryId] = useState<number>(categories[0]?.id ?? 0)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<MenuItem['priceMode']>('fixed')
  const [price, setPrice] = useState('')
  const [veg, setVeg] = useState<'veg' | 'nonveg' | 'either'>('either')
  const action = useAction()

  const priceOk = mode !== 'fixed' || price.trim() === '' || parseRupees(price) !== null
  const ready = categoryId > 0 && name.trim().length > 0 && priceOk

  const create = async () => {
    if (!ready) return
    const body: Record<string, unknown> = {
      categoryId,
      name: name.trim(),
      priceMode: mode,
      isVeg: veg === 'either' ? null : veg === 'veg',
      basePricePaise:
        mode === 'fixed' && price.trim() !== '' ? parseRupees(price) : null,
    }
    if (await action.run(() => api.menu.createItem(body))) onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Add an item">
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      <div className="grid gap-3">
        <Field label="Section">
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(Number(event.target.value))}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base"
          >
            {categories.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
        </Field>

        <Field label="How it is priced" hint="Sizes are added once the item exists.">
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as MenuItem['priceMode'])}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base"
          >
            <option value="fixed">One price</option>
            <option value="variant">Sizes or types</option>
            <option value="ask">Ask at the table</option>
          </select>
        </Field>

        {mode === 'fixed' ? (
          <Field label="Price ₹">
            <Input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              inputMode="decimal"
            />
          </Field>
        ) : null}
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

        <Button size="lg" block disabled={action.busy || !ready} onClick={create}>
          {action.busy ? 'Adding…' : 'Add to the menu'}
        </Button>
      </div>
    </Sheet>
  )
}
