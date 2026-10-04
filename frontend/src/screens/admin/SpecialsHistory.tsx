import { useState } from 'react'
import type { ReactNode } from 'react'

import { AppShell } from '../../components/AppShell'
import { Badge, Empty, ErrorNote, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { dateLabel, todayInGoa } from '../../lib/format'
import { useAsync } from '../../lib/hooks'

/**
 * A read-only log: what was actually shown as Today's Special on a given day.
 * Reconstructed from when each special was added/removed and which weekdays
 * it repeats on - see specialsHistory() on the backend.
 */
export default function SpecialsHistory(): ReactNode {
  const [date, setDate] = useState(todayInGoa())
  const state = useAsync(() => api.specials.history(date), [date])
  const items = state.data?.items ?? []

  return (
    <AppShell title="Specials history" subtitle="What was shown on a past day">
      <label className="mb-4 block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Date
        </span>
        <input
          type="date"
          value={date}
          max={todayInGoa()}
          onChange={(event) => setDate(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-ink outline-none focus:border-ink"
        />
      </label>

      {state.loading ? <Spinner label="Loading" /> : null}
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}

      {state.data ? (
        items.length === 0 ? (
          <Empty title="Nothing was special that day" hint={dateLabel(date)} />
        ) : (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{item.name}</span>
                    {item.source === 'custom' ? <Badge tone="amber">Custom</Badge> : null}
                  </span>
                  {item.description ? (
                    <span className="block truncate text-xs text-slate-500">{item.description}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </AppShell>
  )
}
