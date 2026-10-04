import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { AppShell } from '../../components/AppShell'
import { Badge, Button, Empty, ErrorNote, Field, Input, Sheet, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { parseRupees, plural, rupees } from '../../lib/format'
import { useAction, useAsync } from '../../lib/hooks'

/**
 * What the owner picks for the table QR page: either a star against something
 * already on the menu, or a dish typed in fresh that isn't on the card at all.
 * A menu-sourced pick also surfaces as a pinned quick-pick tab when staff take
 * an order (see getMenu() on the backend) - a custom one only ever shows here
 * and on the public page, since there is no menu item behind it to order.
 *
 * One QR for the whole restaurant: the specials are the same no matter which
 * table scanned it, so every table gets a copy of the same printed code.
 */
export default function SpecialsManager(): ReactNode {
  const state = useAsync(() => api.specials.list(), [])
  const items = state.data?.items ?? []
  const [showQr, setShowQr] = useState(false)

  const reload = () => state.reload()

  return (
    <AppShell
      title="Today's Special"
      subtitle={`${plural(items.length, 'special')} live now`}
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
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{item.name}</span>
                      {item.source === 'custom' ? <Badge tone="amber">Custom</Badge> : null}
                    </span>
                    {item.description ? (
                      <span className="block truncate text-xs text-slate-500">{item.description}</span>
                    ) : null}
                  </span>
                  {item.pricePaise !== null ? (
                    <span className="tnum shrink-0 text-sm font-semibold">{rupees(item.pricePaise)}</span>
                  ) : null}
                </SpecialRow>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <AddFromMenu onAdded={reload} />
      <AddCustom onAdded={reload} />

      {showQr ? <QrSheet onClose={() => setShowQr(false)} /> : null}
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

/** For the dish that isn't on the regular menu at all - no price is fine too. */
function AddCustom({ onAdded }: { onAdded: () => void }): ReactNode {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const action = useAction()

  const priceOk = price.trim() === '' || parseRupees(price) !== null
  const ready = name.trim().length > 0 && priceOk

  const add = async () => {
    if (!ready) return
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      pricePaise: price.trim() === '' ? null : parseRupees(price),
    }
    if (await action.run(() => api.specials.addCustom(body))) {
      setName('')
      setDescription('')
      setPrice('')
      onAdded()
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        Add something not on the menu
      </h2>
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
        <Field label="Price ₹" hint="Optional - leave blank to show no price.">
          <Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" />
        </Field>
        {!priceOk ? <p className="text-xs font-semibold text-nonveg">That price is not a number.</p> : null}
        <Button size="lg" disabled={action.busy || !ready} onClick={add}>
          {action.busy ? 'Adding…' : 'Add to the list'}
        </Button>
      </div>
    </section>
  )
}
