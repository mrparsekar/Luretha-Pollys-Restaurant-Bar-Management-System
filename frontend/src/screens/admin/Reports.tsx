import { useState } from 'react'
import type { ReactNode } from 'react'

import { AppShell } from '../../components/AppShell'
import { Card, ErrorNote, Field, Input, Money, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { dateLabel, plural, rupeesShort, todayInGoa } from '../../lib/format'
import { useAsync } from '../../lib/hooks'

const PRESETS = ['today', 'yesterday', 'week', 'month'] as const
type PresetKey = (typeof PRESETS)[number]

const PRESET_LABEL: Record<PresetKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Last 7 days',
  month: 'This month',
}

const EXPORTS = [
  { type: 'orders', label: 'Bills' },
  { type: 'items', label: 'Items' },
  { type: 'daily', label: 'Day by day' },
  { type: 'categories', label: 'Categories' },
  { type: 'waiters', label: 'Waiters' },
  { type: 'hours', label: 'Hours' },
] as const

/** Business dates are bare 'YYYY-MM-DD', so shift them at UTC noon, never locally. */
function shiftDays(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

function rangeFor(key: PresetKey): { from: string; to: string } {
  const today = todayInGoa()
  if (key === 'yesterday') {
    const day = shiftDays(today, -1)
    return { from: day, to: day }
  }
  if (key === 'week') return { from: shiftDays(today, -6), to: today }
  if (key === 'month') return { from: `${today.slice(0, 7)}-01`, to: today }
  return { from: today, to: today }
}

/**
 * Tracking, which is the whole reason the owner wanted this built. One request
 * fills the screen; the CSV links hand the same numbers to whoever does the books.
 */
export default function Reports(): ReactNode {
  const today = todayInGoa()
  const [range, setRange] = useState({ from: today, to: today })
  const [custom, setCustom] = useState(false)

  const state = useAsync(() => api.reports.summary(range), [range.from, range.to])
  const report = state.data
  const sheet = report?.sheet

  return (
    <AppShell
      title="Reports"
      subtitle={
        range.from === range.to
          ? dateLabel(range.from)
          : `${dateLabel(range.from)} – ${dateLabel(range.to)}`
      }
    >
      <div className="mb-3 grid grid-cols-4 gap-2">
        {PRESETS.map((key) => {
          const preset = rangeFor(key)
          const active = !custom && preset.from === range.from && preset.to === range.to
          return (
            <button
              key={key}
              onClick={() => {
                setCustom(false)
                setRange(preset)
              }}
              className={`min-h-11 rounded-xl px-1 text-xs font-semibold ${
                active ? 'bg-ink text-cream' : 'border border-slate-300 bg-white'
              }`}
            >
              {PRESET_LABEL[key]}
            </button>
          )
        })}
      </div>

      <button
        onClick={() => setCustom(!custom)}
        className="mb-3 text-xs font-semibold text-slate-500 underline"
      >
        {custom ? 'Hide dates' : 'Pick dates'}
      </button>

      {custom ? (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Field label="From">
            <Input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(event) => setRange({ ...range, from: event.target.value || range.from })}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={range.to}
              min={range.from}
              max={today}
              onChange={(event) => setRange({ ...range, to: event.target.value || range.to })}
            />
          </Field>
        </div>
      ) : null}

      {state.loading && !report ? <Spinner label="Adding it up" /> : null}
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}
      {report && sheet ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Net sales" value={rupeesShort(sheet.netPaise)} hint={plural(sheet.orders, 'bill')} big />
            <Stat
              label="Average bill"
              value={rupeesShort(sheet.averageBillPaise)}
              hint={plural(sheet.covers, 'cover')}
              big
            />
            <Stat label="Cash" value={rupeesShort(sheet.cash.paise)} hint={`${sheet.cash.orders} bills`} />
            <Stat label="UPI" value={rupeesShort(sheet.upi.paise)} hint={`${sheet.upi.orders} bills`} />
            <Stat label="Food" value={rupeesShort(sheet.foodPaise)} hint={plural(sheet.itemsSold, 'item')} />
            <Stat label="Bar" value={rupeesShort(sheet.liquorPaise)} hint="drinks" />
          </div>

          <Card>
            <Line label="Gross" paise={sheet.grossPaise} />
            {sheet.discountPaise > 0 ? <Line label="Discounts" paise={-sheet.discountPaise} /> : null}
            {sheet.taxPaise > 0 ? <Line label="Tax" paise={sheet.taxPaise} /> : null}
            {sheet.serviceChargePaise > 0 ? (
              <Line label="Service charge" paise={sheet.serviceChargePaise} />
            ) : null}
            {sheet.roundOffPaise !== 0 ? <Line label="Round off" paise={sheet.roundOffPaise} /> : null}
            <Line label="Net" paise={sheet.netPaise} strong />
            {sheet.voids.lines > 0 ? (
              <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
                {plural(sheet.voids.lines, 'line')} voided, worth {rupeesShort(sheet.voids.paise)}. Not
                counted above.
              </p>
            ) : null}
            {sheet.open.orders > 0 ? (
              <p className="mt-1 text-xs font-semibold text-amber-800">
                {plural(sheet.open.orders, 'tab')} still running, {rupeesShort(sheet.open.paise)} on the
                floor. The day is not closed yet.
              </p>
            ) : null}
          </Card>
          {report.daily.length > 1 ? (
            <Rows
              title="Day by day"
              rows={report.daily.map((row) => ({
                key: row.businessDate,
                label: dateLabel(row.businessDate),
                sub: `${plural(row.orders, 'bill')} · ${plural(row.covers, 'cover')}`,
                paise: row.netPaise,
              }))}
            />
          ) : null}

          <Rows
            title="Busiest hours"
            rows={report.hours.map((row) => ({
              key: String(row.hour),
              label: row.label,
              sub: plural(row.qty, 'item'),
              paise: row.amountPaise,
            }))}
          />

          <Rows
            title="Waiters"
            rows={report.waiters.map((row) => ({
              key: String(row.waiterId),
              label: row.name,
              sub: `${plural(row.orders, 'bill')} · avg ${rupeesShort(row.averageBillPaise)}`,
              paise: row.netPaise,
            }))}
          />

          <Rows
            title="Categories"
            rows={report.categories.map((row) => ({
              key: row.category,
              label: row.category,
              sub: `${row.group} · ${plural(row.qty, 'sold')}`,
              paise: row.amountPaise,
            }))}
          />

          <Rows
            title="Top items"
            rows={report.topItems.map((row) => ({
              key: `${row.name}-${row.variant ?? ''}`,
              label: row.variant ? `${row.name} · ${row.variant}` : row.name,
              sub: `${row.category} · ${row.qty}×`,
              paise: row.amountPaise,
            }))}
          />
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              Download as CSV
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {EXPORTS.map((entry) => (
                <a
                  key={entry.type}
                  href={api.reports.exportUrl(entry.type, range)}
                  className="flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-1 text-xs font-semibold active:bg-slate-100"
                >
                  {entry.label}
                </a>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Opens in Excel or Sheets. Covers the range shown above.
            </p>
          </section>
        </div>
      ) : null}
    </AppShell>
  )
}

function Stat({
  label,
  value,
  hint,
  big = false,
}: {
  label: string
  value: string
  hint?: string
  big?: boolean
}): ReactNode {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`tnum font-bold ${big ? 'text-2xl' : 'text-lg'}`}>{value}</p>
      {hint ? <p className="truncate text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

function Line({
  label,
  paise,
  strong = false,
}: {
  label: string
  paise: number
  strong?: boolean
}): ReactNode {
  return (
    <div
      className={`flex items-center justify-between py-1 ${
        strong ? 'mt-1 border-t border-slate-200 pt-2 text-base font-bold' : 'text-sm'
      }`}
    >
      <span>{label}</span>
      <Money paise={paise} strong={strong} />
    </div>
  )
}

type Row = { key: string; label: string; sub?: string; paise: number }

/** Every breakdown on this screen is the same shape, so it is the same component. */
function Rows({ title, rows }: { title: string; rows: Row[] }): ReactNode {
  if (rows.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h2>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-3 p-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{row.label}</span>
              {row.sub ? (
                <span className="block truncate text-xs text-slate-500">{row.sub}</span>
              ) : null}
            </span>
            <Money paise={row.paise} className="shrink-0 text-sm" />
          </li>
        ))}
      </ul>
    </section>
  )
}
