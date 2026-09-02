import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { AmountDisplay, AmountPad } from './AmountPad'
import { Button, Input, Money, Sheet, Stepper } from './ui'
import { parseRupees, rupees } from '../lib/format'
import type { MenuItem, MenuVariant } from '../lib/types'

export type Draft = {
  /** Local id: two lines of the same item with different notes must stay apart. */
  key: string
  menuItemId: number
  variantId: number | null
  name: string
  variantLabel: string | null
  unitPricePaise: number
  /** True when the waiter keyed the price in, so submit sends it back. */
  askedPrice: boolean
  qty: number
  note: string | null
}

/**
 * One sheet does all three shapes the printed menu has: a plain priced item, an
 * item with sizes (30ml/60ml, glass/bottle, cup/pot), and the eleven seafood
 * rows printed with no price at all.
 *
 * The caller keys this on the item id so opening a second item starts clean
 * rather than inheriting the last one's size, qty and note.
 */
export function ItemSheet({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem | null
  onClose: () => void
  onAdd: (draft: Draft) => void
}): ReactNode {
  const [variant, setVariant] = useState<MenuVariant | null>(null)
  const [amount, setAmount] = useState('')
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')

  const resolved = useMemo(() => {
    if (!item) return null
    const isVariant = item.priceMode === 'variant'
    const needsPrice = isVariant ? (variant?.needsPrice ?? false) : item.needsPrice
    const menuPrice = isVariant ? (variant?.pricePaise ?? null) : item.basePricePaise
    const typed = parseRupees(amount)
    return {
      isVariant,
      needsPrice,
      unitPricePaise: needsPrice ? typed : menuPrice,
      waitingForVariant: isVariant && !variant,
    }
  }, [item, variant, amount])

  if (!item || !resolved) return null

  const ready =
    !resolved.waitingForVariant &&
    resolved.unitPricePaise !== null &&
    resolved.unitPricePaise > 0 &&
    qty > 0

  const add = () => {
    if (!ready || resolved.unitPricePaise === null) return
    onAdd({
      key: `${Date.now()}-${item.id}-${variant?.id ?? 0}`,
      menuItemId: item.id,
      variantId: variant?.id ?? null,
      name: item.name,
      variantLabel: variant?.label ?? null,
      unitPricePaise: resolved.unitPricePaise,
      askedPrice: resolved.needsPrice,
      qty,
      note: note.trim() || null,
    })
  }

  return (
    <Sheet open onClose={onClose} title={item.name}>
      {item.description ? <p className="mb-3 text-sm text-slate-500">{item.description}</p> : null}

      {resolved.isVariant ? (
        <div className="mb-4 grid grid-cols-2 gap-2">
          {item.variants.map((option) => (
            <button
              key={option.id}
              onClick={() => {
                setVariant(option)
                setAmount('')
              }}
              className={`min-h-14 rounded-xl border-2 px-3 text-left text-sm font-semibold ${
                variant?.id === option.id
                  ? 'border-ink bg-ink text-cream'
                  : 'border-slate-300 bg-white active:bg-slate-100'
              }`}
            >
              {option.label}
              <span className="tnum block text-xs font-normal">
                {option.pricePaise === null ? 'ask' : rupees(option.pricePaise)}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {resolved.waitingForVariant ? (
        <p className="text-sm text-slate-500">Choose a size to continue.</p>
      ) : (
        <>
          {resolved.needsPrice ? (
            <div className="mb-4">
              <AmountDisplay value={amount} hint="Printed without a price. Key in today's rate." />
              <AmountPad value={amount} onChange={setAmount} />
            </div>
          ) : (
            <p className="mb-4 text-sm text-slate-500">
              Rate <Money paise={resolved.unitPricePaise ?? 0} strong />
            </p>
          )}

          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Qty</span>
            <Stepper value={qty} onChange={setQty} min={1} max={99} />
          </div>

          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Note for the kitchen: no onion, extra spicy…"
            maxLength={200}
            className="mb-4"
          />

          <Button size="lg" block disabled={!ready} onClick={add}>
            Add
            {resolved.unitPricePaise
              ? ` · ${rupees(resolved.unitPricePaise * qty)}`
              : ''}
          </Button>
        </>
      )}
    </Sheet>
  )
}
