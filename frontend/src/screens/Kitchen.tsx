import { useState } from 'react'
import type { ReactNode } from 'react'

import { AppShell } from '../components/AppShell'
import { Button, Empty, ErrorNote, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { plural, since, timeLabel } from '../lib/format'
import { useAction, usePoll, useTicker } from '../lib/hooks'

type Group = 'all' | 'kitchen' | 'bar'

/**
 * The screen that replaces the paper slip run to the kitchen. It refreshes on a
 * timer, oldest ticket first, and a line is tapped off as it goes out. Both
 * passes share it: the bar filter shows only drinks, the kitchen filter only food.
 */
export default function Kitchen(): ReactNode {
  const [group, setGroup] = useState<Group>('all')
  const state = usePoll(
    (signal) => api.orders.kitchen(group === 'all' ? undefined : group, { signal }),
    10_000,
    [group],
  )
  const action = useAction()
  const now = useTicker(15_000)

  const tickets = state.data?.tickets ?? []
  const waiting = tickets.reduce((sum, ticket) => sum + ticket.lines.length, 0)

  const markReady = async (orderId: number, itemId: number) => {
    await action.run(() => api.orders.serveItem(orderId, itemId))
    state.reload()
  }

  return (
    <AppShell title="Kitchen & bar" subtitle={`${plural(waiting, 'line')} waiting`}>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {(['all', 'kitchen', 'bar'] as Group[]).map((value) => (
          <Button
            key={value}
            variant={group === value ? 'primary' : 'secondary'}
            onClick={() => setGroup(value)}
          >
            {value === 'all' ? 'Everything' : value === 'kitchen' ? 'Kitchen' : 'Bar'}
          </Button>
        ))}
      </div>

      {state.loading && !state.data ? <Spinner label="Loading tickets" /> : null}
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}
      {action.error ? (
        <div className="mb-3">
          <ErrorNote message={action.error} />
        </div>
      ) : null}

      {state.data && tickets.length === 0 ? (
        <Empty title="Nothing waiting" hint="New rounds appear here on their own." />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {tickets.map((ticket) => {
          const age = Math.floor((now - new Date(ticket.placedAt).getTime()) / 60_000)
          const late = age >= 15
          return (
            <article
              key={`${ticket.orderId}-${ticket.roundNo}`}
              className={`rounded-2xl border-2 bg-white p-3 ${
                late ? 'border-nonveg' : 'border-slate-200'
              }`}
            >
              <header className="mb-2 flex items-start justify-between gap-2 border-b border-dashed border-slate-300 pb-2">
                <div>
                  <p className="tnum text-lg font-bold">
                    #{ticket.orderNo} · {ticket.tableLabel ?? 'Takeaway'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Round {ticket.roundNo} · {ticket.waiterName} · {timeLabel(ticket.placedAt)}
                  </p>
                </div>
                <span
                  className={`tnum shrink-0 text-sm font-bold ${late ? 'text-nonveg' : 'text-slate-500'}`}
                >
                  {since(ticket.placedAt, now)}
                </span>
              </header>

              <ul className="space-y-2">
                {ticket.lines.map((line) => (
                  <li key={line.id} className="flex items-start gap-3">
                    <span className="tnum w-8 shrink-0 text-lg font-bold">{line.qty}×</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {line.name}
                        {line.variant ? (
                          <span className="font-normal text-slate-500"> · {line.variant}</span>
                        ) : null}
                      </p>
                      {line.note ? (
                        <p className="text-xs font-bold uppercase text-nonveg">{line.note}</p>
                      ) : null}
                    </div>
                    <Button
                      variant="secondary"
                      disabled={action.busy}
                      onClick={() => markReady(ticket.orderId, line.id)}
                      className="shrink-0"
                    >
                      Ready
                    </Button>
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </div>
    </AppShell>
  )
}
