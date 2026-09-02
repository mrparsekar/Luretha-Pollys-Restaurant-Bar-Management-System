import type { ReactNode } from 'react'

import { parseRupees } from '../lib/format'

/**
 * Rupee entry for the ask-for-price seafood and for discounts. A pad rather than
 * a number input: the value is validated as it is typed, so a waiter cannot key
 * "12.345" into a bill, and the phone keyboard never covers the sheet.
 */
export function AmountPad({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}): ReactNode {
  const press = (key: string) => {
    const next = value + key
    // Reuse the parser as the validator so screen and API agree on what a price is.
    if (key === '.' ? /^\d{1,7}\.$/.test(next) : parseRupees(next) !== null) onChange(next)
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0']

  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          className="tnum min-h-14 rounded-xl border border-slate-300 bg-white text-xl font-semibold active:bg-slate-100"
        >
          {key}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(value.slice(0, -1))}
        className="min-h-14 rounded-xl border border-slate-300 bg-white text-xl active:bg-slate-100"
      >
        <span aria-hidden>⌫</span>
        <span className="sr-only">Backspace</span>
      </button>
    </div>
  )
}

export function AmountDisplay({ value, hint }: { value: string; hint?: string }): ReactNode {
  return (
    <div className="mb-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-right">
      <span className="tnum text-2xl font-bold">₹{value || '0'}</span>
      {hint ? <p className="text-xs font-normal text-slate-500">{hint}</p> : null}
    </div>
  )
}
