import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

import { rupees } from '../lib/format'

/* Shared primitives. Every tappable thing is at least 44px tall: this is used
 * one-handed, at night, by someone carrying plates. */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'lg'
  block?: boolean
}

const VARIANTS: Record<string, string> = {
  primary: 'bg-ink text-cream active:bg-ink-soft disabled:bg-slate-400',
  secondary: 'bg-white text-ink border border-slate-300 active:bg-slate-100',
  ghost: 'bg-transparent text-ink active:bg-slate-200',
  danger: 'bg-nonveg text-white active:bg-red-800',
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  ...rest
}: ButtonProps): ReactNode {
  const height = size === 'lg' ? 'min-h-14 text-base' : 'min-h-11 text-sm'
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 font-semibold transition-colors disabled:opacity-60 ${height} ${VARIANTS[variant]} ${block ? 'w-full' : ''} ${className}`}
    />
  )
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}): ReactNode {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

/** Amounts are right-aligned and tabular so columns of digits line up. */
export function Money({
  paise,
  className = '',
  strong = false,
}: {
  paise: number
  className?: string
  strong?: boolean
}): ReactNode {
  return (
    <span className={`tnum ${strong ? 'font-bold' : ''} ${className}`}>{rupees(paise)}</span>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}): ReactNode {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  )
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return (
    <input
      {...rest}
      className={`min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-ink outline-none focus:border-ink ${className}`}
    />
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }): ReactNode {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-ink"
      />
      <span role="status">{label}</span>
    </div>
  )
}

/** Failures are shown, never swallowed: the API's message is already staff-facing. */
export function ErrorNote({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}): ReactNode {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      <span>{message}</span>
      {onRetry ? (
        <button onClick={onRetry} className="shrink-0 font-semibold underline">
          Retry
        </button>
      ) : null}
    </div>
  )
}

export function Empty({ title, hint }: { title: string; hint?: string }): ReactNode {
  return (
    <div className="py-12 text-center">
      <p className="font-semibold text-slate-600">{title}</p>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode
  tone?: 'slate' | 'green' | 'amber' | 'blue' | 'red'
}): ReactNode {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-green-100 text-green-800',
    amber: 'bg-amber-100 text-amber-900',
    blue: 'bg-blue-100 text-blue-800',
    red: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}

/** Big plus/minus rather than a number field: quicker, and no keyboard. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label = 'Quantity',
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  label?: string
}): ReactNode {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={`${label} down`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="size-12 rounded-xl border border-slate-300 bg-white text-2xl font-bold leading-none active:bg-slate-100 disabled:opacity-40"
      >
        −
      </button>
      <span className="tnum min-w-10 text-center text-xl font-bold" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`${label} up`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="size-12 rounded-xl border border-slate-300 bg-white text-2xl font-bold leading-none active:bg-slate-100 disabled:opacity-40"
      >
        +
      </button>
    </div>
  )
}

/** A bottom sheet: on a phone a dialog belongs under the thumb, not centred. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}): ReactNode {
  if (!open) return null
  return (
    <div className="no-print fixed inset-0 z-40 flex items-end" role="dialog" aria-modal="true">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        tabIndex={-1}
      />
      <div className="safe-bottom relative z-10 max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-cream p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} className="min-h-11 px-2 text-sm font-semibold text-slate-500">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

