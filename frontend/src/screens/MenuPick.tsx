import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ItemSheet, type Draft } from '../components/ItemSheet'
import { Badge, Button, Empty, ErrorNote, Input, Money, Sheet, Spinner, Stepper } from '../components/ui'
import { ApiError, api, type NewLine } from '../lib/api'
import { plural, rupees } from '../lib/format'
import { useAction, useAsync, useStoredState } from '../lib/hooks'
import type { MenuCategory, MenuItem, OrderType } from '../lib/types'

/**
 * The order pad. A round is built up locally - and kept in localStorage, so a
 * locked phone or a dropped connection does not lose it - then submitted as one
 * request, which is what makes it a numbered round the kitchen can work from.
 *
 * Two ways in: `/order/:id/menu` adds a round to an order that already exists,
 * and `/new/menu` (no id, table/guest choices carried as query params) builds
 * the very first round before the order exists at all - it is only opened once
 * that round is actually sent, so a table picked by mistake never creates
 * anything to clean up.
 */
export default function MenuPick(): ReactNode {
  const { id } = useParams()
  const orderId = id ? Number(id) : null
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const pendingOrderType: OrderType = searchParams.get('type') === 'takeaway' ? 'takeaway' : 'dine_in'
  const pendingTableId = searchParams.get('table') ? Number(searchParams.get('table')) : null
  const pendingTableLabel = searchParams.get('tableLabel')
  const pendingGuests = searchParams.get('guests') ? Number(searchParams.get('guests')) : 0
  const pendingGuestName = searchParams.get('guestName')
  const repeatLastRound = searchParams.get('repeat') === '1'

  const menu = useAsync(() => api.menu.getCached(), [])
  const detail = useAsync(
    (signal) => (orderId ? api.orders.detail(orderId, { signal }) : Promise.resolve(null)),
    [orderId],
  )
  const [draft, setDraft] = useStoredState<Draft[]>(
    orderId ? `lp.round.${orderId}` : `lp.round.pending.${pendingTableId ?? 'takeaway'}`,
    [],
  )
  const action = useAction()
  const [openError, setOpenError] = useState<ApiError | null>(null)
  const [repeatNote, setRepeatNote] = useState<string | null>(null)

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
  const nextRound = orderId
    ? (detail.data?.items.reduce((max, item) => Math.max(max, item.roundNo), 0) ?? 0) + 1
    : 1

  /**
   * Qty is editable right up to the moment the round goes in - "make that two"
   * arrives after the round is built far more often than before it.
   */
  const changeQty = (key: string, qty: number) => {
    setDraft(draft.map((line) => (line.key === key ? { ...line, qty } : line)))
  }

  const removeLine = (key: string) => {
    setDraft(draft.filter((line) => line.key !== key))
  }

  // Pre-fills the review sheet from last round's items, priced fresh off the live
  // menu, once both loads land - runs once, and never over a round already in progress.
  const appliedRepeat = useRef(false)
  useEffect(() => {
    if (!repeatLastRound || orderId === null || appliedRepeat.current) return
    if (!menu.data || !detail.data) return
    appliedRepeat.current = true
    if (draft.length > 0) return

    const items = detail.data.items
    const lastRound = items.reduce((max, item) => Math.max(max, item.roundNo), 0)
    const itemById = new Map(categories.flatMap((category) => category.items.map((item) => [item.id, item])))

    const built: Draft[] = []
    let skipped = 0

    for (const line of items) {
      if (line.roundNo !== lastRound || line.status === 'void') continue
      const live = line.menuItemId ? itemById.get(line.menuItemId) : undefined
      if (!live || !live.available || !live.servingNow) {
        skipped += 1
        continue
      }

      let unitPricePaise = line.unitPricePaise
      let askedPrice = false
      let variantLabel: string | null = null
      let variantId: number | null = null

      if (live.priceMode === 'variant') {
        const variant = live.variants.find((entry) => entry.id === line.variantId)
        if (!variant || variant.pricePaise === null) {
          skipped += 1
          continue
        }
        variantId = variant.id
        variantLabel = variant.label
        unitPricePaise = variant.pricePaise
      } else if (live.priceMode === 'ask') {
        // No re-prompt in a repeat: keep what it went for last time.
        askedPrice = true
      } else if (live.basePricePaise !== null) {
        unitPricePaise = live.basePricePaise
      } else {
        skipped += 1
        continue
      }

      built.push({
        key: `repeat-${line.id}`,
        menuItemId: live.id,
        variantId,
        name: live.name,
        variantLabel,
        unitPricePaise,
        askedPrice,
        qty: line.qty,
        note: line.note,
      })
    }

    if (built.length > 0) {
      setDraft(built)
      setReviewing(true)
    }
    if (skipped > 0) {
      setRepeatNote(`${plural(skipped, 'item')} from last round can't be added right now and ${skipped === 1 ? 'was' : 'were'} left out.`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatLastRound, orderId, menu.data, detail.data])

  const openPendingOrder = async (): Promise<{ id: number } | null> => {
    setOpenError(null)
    try {
      const opened = await api.orders.open({
        orderType: pendingOrderType,
        diningTableId: pendingOrderType === 'dine_in' ? pendingTableId : null,
        guests: pendingOrderType === 'dine_in' ? pendingGuests : 0,
        guestName: pendingGuestName,
      })
      return opened.order
    } catch (cause) {
      setOpenError(cause instanceof ApiError ? cause : new ApiError(0, 'error', 'Could not open the order.'))
      return null
    }
  }

  const submit = async () => {
    const lines: NewLine[] = draft.map((line) => ({
      menuItemId: line.menuItemId,
      variantId: line.variantId,
      qty: line.qty,
      note: line.note,
      // Only ask-price lines carry a price; everything else is priced by the API.
      unitPricePaise: line.askedPrice ? line.unitPricePaise : null,
    }))

    if (orderId === null) {
      const opened = await openPendingOrder()
      if (!opened) return
      await action.run(() => api.orders.addItems(opened.id, lines))
      setDraft([])
      setReviewing(false)
      // The order exists either way now - if adding the round itself failed,
      // the tab screen shows it empty with "Add items" ready to retry.
      navigate(`/order/${opened.id}`, { replace: true })
      return
    }

    const result = await action.run(() => api.orders.addItems(orderId, lines))
    if (!result) return
    setDraft([])
    setReviewing(false)
    navigate(`/order/${orderId}`, { replace: true })
  }

  return (
    <div className="min-h-dvh bg-cream pb-24">
      <header className="safe-top sticky top-0 z-20 border-b border-ink-soft bg-ink text-cream">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-3 lg:max-w-5xl lg:px-6">
          <Link
            to={orderId ? `/order/${orderId}` : '/floor'}
            className="min-h-11 px-1 text-lg"
            aria-label="Back"
          >
            ‹
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {orderId
                ? order
                  ? `#${order.orderNo}`
                  : 'Order'
                : 'New order'}
              {orderId
                ? detail.data?.tableLabel
                  ? ` · ${detail.data.tableLabel}`
                  : ''
                : pendingTableLabel
                  ? ` · ${pendingTableLabel}`
                  : pendingOrderType === 'takeaway'
                    ? ' · Takeaway'
                    : ''}
            </p>
            <p className="text-xs text-cream/70">Round {nextRound}</p>
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-3 pb-3 lg:max-w-5xl lg:px-6">
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

      <main className="mx-auto max-w-3xl px-3 py-3 lg:max-w-5xl lg:px-6">
        {menu.loading || detail.loading ? <Spinner label="Loading menu" /> : null}
        {menu.error ? <ErrorNote message={menu.error.message} onRetry={menu.reload} /> : null}
        {detail.error ? <ErrorNote message={detail.error.message} onRetry={detail.reload} /> : null}
        {action.error ? <ErrorNote message={action.error} /> : null}
        {openError ? (
          <div className="mb-3 space-y-2">
            <ErrorNote message={openError.message} />
            {(openError.details as { orderId?: number } | undefined)?.orderId ? (
              <Button
                variant="secondary"
                block
                onClick={() =>
                  navigate(`/order/${(openError.details as { orderId: number }).orderId}`)
                }
              >
                Open that running tab
              </Button>
            ) : null}
          </div>
        ) : null}
        {repeatNote ? (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {repeatNote}
          </p>
        ) : null}

        {menu.data && results.length === 0 ? (
          <Empty title="Nothing found" hint="Try a shorter word, or pick a section above." />
        ) : null}

        <ul className="grid divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid-cols-2 md:divide-y-0 md:gap-px md:bg-slate-200 md:[&>li]:bg-white">
          {results.map((item) => (
            <ItemRow key={item.id} item={item} onPick={() => setPicked(item)} showCategory={Boolean(query)} />
          ))}
        </ul>
      </main>

      {count > 0 ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-3">
          <div className="mx-auto flex max-w-3xl items-center gap-3 lg:max-w-5xl">
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
        <p className="mb-2 text-xs text-slate-500">
          Check the round before it goes in. Use − and + to change how many, or Remove to take a line
          off.
        </p>
        <ul className="mb-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {draft.map((line) => (
            <li key={line.key} className="p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {line.name}
                    {line.variantLabel ? (
                      <span className="font-normal text-slate-500"> · {line.variantLabel}</span>
                    ) : null}
                  </p>
                  <p className="tnum text-xs text-slate-500">
                    {rupees(line.unitPricePaise)} each
                    {line.askedPrice ? ' · price keyed in' : ''}
                  </p>
                  {line.note ? (
                    <p className="text-xs italic text-slate-600">{line.note}</p>
                  ) : null}
                </div>
                <Money paise={line.qty * line.unitPricePaise} strong className="shrink-0 text-sm" />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <Stepper
                  value={line.qty}
                  onChange={(next) => changeQty(line.key, next)}
                  min={1}
                  max={99}
                  label={`${line.name} quantity`}
                />
                <button
                  onClick={() => removeLine(line.key)}
                  className="min-h-11 px-2 text-sm font-semibold text-nonveg"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>

        {draft.length === 0 ? (
          <p className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
            The round is empty. Tap “Keep adding” to put something on it.
          </p>
        ) : null}

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

