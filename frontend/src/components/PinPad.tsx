import type { ReactNode } from 'react'

/**
 * A numeric pad rather than the phone keyboard: it is faster with one thumb, it
 * cannot autocorrect, and it never covers the screen it belongs to.
 */
export function PinPad({
  value,
  onChange,
  max = 6,
  disabled = false,
}: {
  value: string
  onChange: (next: string) => void
  max?: number
  disabled?: boolean
}): ReactNode {
  const press = (digit: string) => {
    if (value.length >= max) return
    onChange(value + digit)
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.map((digit) => (
        <PadKey key={digit} onClick={() => press(digit)} disabled={disabled}>
          {digit}
        </PadKey>
      ))}
      <PadKey onClick={() => onChange('')} disabled={disabled} muted>
        <span className="text-sm">Clear</span>
      </PadKey>
      <PadKey onClick={() => press('0')} disabled={disabled}>
        0
      </PadKey>
      <PadKey onClick={() => onChange(value.slice(0, -1))} disabled={disabled} muted>
        <span aria-hidden className="text-xl">
          ⌫
        </span>
        <span className="sr-only">Backspace</span>
      </PadKey>
    </div>
  )
}

function PadKey({
  children,
  onClick,
  disabled,
  muted = false,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  muted?: boolean
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-16 items-center justify-center rounded-2xl text-2xl font-semibold tnum transition-colors disabled:opacity-50 ${
        muted
          ? 'bg-transparent text-cream/70 active:bg-white/10'
          : 'bg-white/10 text-cream active:bg-white/25'
      }`}
    >
      {children}
    </button>
  )
}

/** Filled dots, so a waiter can see how many digits landed without showing the PIN. */
export function PinDots({ length, max = 6 }: { length: number; max?: number }): ReactNode {
  return (
    <div className="flex items-center justify-center gap-3 py-2" aria-hidden>
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          className={`size-3 rounded-full ${index < length ? 'bg-sand' : 'bg-white/25'}`}
        />
      ))}
    </div>
  )
}
