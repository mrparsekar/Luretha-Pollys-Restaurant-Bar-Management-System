import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ItemSheet, type Draft } from '../components/ItemSheet'
import { Badge, Button, Empty, ErrorNote, Input, Money, Sheet, Spinner } from '../components/ui'
import { api, type NewLine } from '../lib/api'
import { plural, rupees } from '../lib/format'
import { useAction, useAsync, useStoredState } from '../lib/hooks'
import type { MenuCategory, MenuItem } from '../lib/types'

/**
 * The order pad. A round is built up locally - and kept in localStorage, so a
 * locked phone or a dropped connection does not lose it - then submitted as one
 * request, which is what makes it a numbered round the kitchen can work from.
 */
export default function MenuPick(): ReactNode {
  const { id } = useParams()
  const orderId = Number(id)
  const navigate = useNavigate()

  const menu = useAsync(() => api.menu.get(), [])
  const detail = useAsync((signal) => api.orders.detail(orderId, { signal }), [orderId])
  const [draft, setDraft] = useStoredState<Draft[]>(`lp.round.${orderId}`, [])
  const action = useAction()

  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [picked, setPicked] = useState<MenuItem | null>(null)
  const [reviewing, setReviewing] = useState(false)

  const categories = menu.data?.menu ?? []
  const active = categoryId ?? categories[0]?.id ?? null

  const results = useMemo(() => searchMenu(categories, query, active), [categories, query, active])

  const count = draft.reduce((sum, line) => sum + line.qty, 0)
  const total = draft.reduce((sum, line) => sum + line.qty * line.unitPricePaise, 0)
  const order = detail.data?.order
  const nextRound = (detail.data?.items.reduce((max, item) => Math.max(max, item.roundNo), 0) ?? 0) + 1

  const submit = async () => {
    const lines: NewLine[] = draft.map((line) => ({
      menuItemId: line.menuItemId,
      variantId: line.variantId,
      qty: line.qty,
      note: line.note,
      // Only ask-price lines carry a price; everything else is priced by the API.
      unitPricePaise: line.askedPrice ? line.unitPricePaise : null,
    }))
    const result = await action.run(() => api.orders.addItems(orderId, lines))
    if (!result) return
    setDraft([])
    setReviewing(false)
    navigate(`/order/${orderId}`, { replace: true })
  }

  return (
    <div className="min-h-dvh bg-cream pb-24">
      <header className="safe-top sticky top-0 z-20 border-b border-ink-soft bg-ink text-cream">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-3">
          <Link to={`/order/${orderId}`} className="min-h-11 px-1 text-lg" aria-label="Back to tab">
            ‹
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {order ? `#${order.orderNo}` : 'Order'}
              {detail.data?.tableLabel ? ` · ${detail.data.tableLabel}` : ''}
            </p>
            <p className="text-xs text-cream/70">Round {nextRound}</p>
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-3 pb-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the menu"
            inputMode="search"
            className="border-transparent"
          />
        </div>
      </header>

      {!query ? (
        <div className="no-scrollbar sticky top-[7.5rem] z-10 overflow-x-auto border-b border-slate-200 bg-cream/95 px-3 py-2 backdrop-blur">
          <div className="flex gap-2">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setCategoryId(category.id)}
                className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${
                  active === category.id
                    ? 'bg-ink text-cream'
                    : 'bg-white text-slate-600 active:bg-slate-100'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-3xl px-3 py-3">
        {menu.loading || detail.loading ? <Spinner label="Loading menu" /> : null}
        {menu.error ? <ErrorNote message={menu.error.message} onRetry={menu.reload} /> : null}
        {detail.error ? <ErrorNote message={detail.error.message} onRetry={detail.reload} /> : null}
        {action.error ? <ErrorNote message={action.error} /> : null}

        {menu.data && results.length === 0 ? (
          <Empty title="Nothing found" hint="Try a shorter word, or pick a section above." />
        ) : null}

        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {results.map((item) => (
            <ItemRow key={item.id} item={item} onPick={() => setPicked(item)} showCategory={Boolean(query)} />
          ))}
        </ul>
      </main>

      {count > 0 ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-3">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-slate-500">{plural(count, 'item')} in round {nextRound}</p>
              <Money paise={total} strong className="text-lg" />
            </div>
            <Button size="lg" onClick={() => setReviewing(true)}>
              Review round
            </Button>
          </div>
        </div>
      ) : null}

      <ItemSheet
        key={picked?.id ?? 'none'}
        item={picked}
        onClose={() => setPicked(null)}
        onAdd={(line) => {
          setDraft([...draft, line])
          setPicked(null)
        }}
      />

      <Sheet open={reviewing} onClose={() => setReviewing(false)} title={`Round ${nextRound}`}>
        <ul className="mb-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {draft.map((line) => (
            <li key={line.key} className="flex items-start gap-3 p-3">
              <span className="tnum w-8 shrink-0 font-bold">{line.qty}×</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {line.name}
                  {line.variantLabel ? (
                    <span className="font-normal text-slate-500"> · {line.variantLabel}</span>
                  ) : null}
                </p>
                {line.note ? <p className="text-xs text-slate-500">{line.note}</p> : null}
                {line.askedPrice ? (
                  <p className="text-xs text-slate-500">Price keyed in: {rupees(line.unitPricePaise)}</p>
                ) : null}
              </div>
              <Money paise={line.qty * line.unitPricePaise} className="shrink-0 text-sm" />
              <button
                onClick={() => setDraft(draft.filter((other) => other.key !== line.key))}
                className="min-h-11 shrink-0 px-2 text-sm font-semibold text-nonveg"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        {action.error ? (
          <div className="mb-3">
            <ErrorNote message={action.error} />
          </div>
        ) : null}

        <div className="mb-3 flex items-center justify-between text-base font-bold">
          <span>Round total</span>
          <Money paise={total} strong />
        </div>

        <Button size="lg" block disabled={action.busy || draft.length === 0} onClick={submit}>
          {action.busy ? 'Sending…' : 'Send to kitchen'}
        </Button>
        <Button variant="ghost" block className="mt-2" onClick={() => setReviewing(false)}>
          Keep adding
        </Button>
      </Sheet>
    </div>
  )
}

/** Search runs across every section; with no query the chosen section is shown. */
function searchMenu(
  categories: MenuCategory[],
  query: string,
  activeId: number | null,
): (MenuItem & { categoryName?: string })[] {
  const text = query.trim().toLowerCase()
  if (!text) {
    const category = categories.find((entry) => entry.id === activeId)
    return category ? category.items : []
  }

  const hits: (MenuItem & { categoryName?: string })[] = []
  for (const category of categories) {
    for (const item of category.items) {
      if (
        item.name.toLowerCase().includes(text) ||
        item.description?.toLowerCase().includes(text) ||
        item.variants.some((variant) => variant.label.toLowerCase().includes(text))
      ) {
        hits.push({ ...item, categoryName: category.name })
        // 360 items on a phone: enough to choose from, short enough to stay fast.
        if (hits.length >= 40) return hits
      }
    }
  }
  return hits
}

function priceLabel(item: MenuItem): string {
  if (item.priceMode === 'ask' || item.needsPrice) return 'Ask'
  if (item.priceMode === 'variant') {
    const prices = item.variants
      .map((variant) => variant.pricePaise)
      .filter((price): price is number => price !== null)
    if (prices.length === 0) return 'Ask'
    const low = Math.min(...prices)
    const high = Math.max(...prices)
    return low === high ? rupees(low) : `${rupees(low)} – ${rupees(high)}`
  }
  return item.basePricePaise === null ? 'Ask' : rupees(item.basePricePaise)
}

function ItemRow({
  item,
  onPick,
  showCategory,
}: {
  item: MenuItem & { categoryName?: string }
  onPick: () => void
  showCategory: boolean
}): ReactNode {
  // 86'd by the owner, or outside the 7pm-10pm steak window: say which, and why.
  const blocked = !item.available || !item.servingNow
  const reason = !item.available
    ? 'Off the menu right now'
    : `Served ${item.windowLabel ?? 'at set hours'} only`

  return (
    <li>
      <button
        onClick={onPick}
        disabled={blocked}
        className="flex w-full items-center gap-3 p-3 text-left active:bg-slate-50 disabled:opacity-50"
      >
        {item.isVeg === null ? null : (
          <span
            aria-hidden
            className={`size-3 shrink-0 rounded-sm border-2 ${
              item.isVeg ? 'border-veg' : 'border-nonveg'
            }`}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{item.name}</span>
          {showCategory && item.categoryName ? (
            <span className="block truncate text-xs text-slate-400">{item.categoryName}</span>
          ) : null}
          {item.description ? (
            <span className="block truncate text-xs text-slate-500">{item.description}</span>
          ) : null}
          {blocked ? <span className="mt-1 inline-block"><Badge tone="red">{reason}</Badge></span> : null}
        </span>
        <span className="tnum shrink-0 text-sm font-semibold">{priceLabel(item)}</span>
      </button>
    </li>
  )
}

