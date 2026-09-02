import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'

import { usePrintMode } from '../components/BillPaper'
import { Button, ErrorNote, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { timeLabel } from '../lib/format'
import { useAsync } from '../lib/hooks'

/**
 * The kitchen ticket. No prices anywhere on it - the kitchen needs what to cook
 * and any note, and money on a KOT only invites confusion. One ticket per round,
 * because that is the unit the kitchen works in.
 */
export default function Kot(): ReactNode {
  const { id } = useParams()
  const orderId = Number(id)
  const state = useAsync((signal) => api.orders.detail(orderId, { signal }), [orderId])
  const [round, setRound] = useState<number | null>(null)
  usePrintMode('receipt')

  const detail = state.data
  const items = detail?.items.filter((item) => item.status !== 'void') ?? []
  const rounds = [...new Set(items.map((item) => item.roundNo))].sort((a, b) => a - b)
  const showing = round ?? rounds[rounds.length - 1] ?? null
  const lines = items.filter((item) => item.roundNo === showing)

  return (
    <div className="min-h-dvh bg-cream">
      <header className="safe-top no-print sticky top-0 z-20 border-b border-ink-soft bg-ink text-cream">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-3">
          <Link to={`/order/${orderId}`} className="min-h-11 px-1 text-lg" aria-label="Back to tab">
            ‹
          </Link>
          <p className="flex-1 truncate text-sm font-bold">Kitchen ticket</p>
          <Button size="md" className="bg-sand text-ink" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 py-4">
        {state.loading && !detail ? <Spinner label="Loading order" /> : null}
        {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}

        {rounds.length > 1 ? (
          <div className="no-print mb-4 flex flex-wrap gap-2">
            {rounds.map((value) => (
              <Button
                key={value}
                variant={showing === value ? 'primary' : 'secondary'}
                onClick={() => setRound(value)}
              >
                Round {value}
              </Button>
            ))}
          </div>
        ) : null}

        {detail && showing !== null ? (
          <div className="paper mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <header className="border-b border-dashed border-slate-400 pb-2 text-center">
              <p className="text-base font-bold uppercase tracking-wide">Kitchen ticket</p>
              <p className="tnum text-2xl font-bold">
                #{detail.order.orderNo} · {detail.tableLabel ?? 'Takeaway'}
              </p>
              <p className="text-xs">
                Round {showing} · {timeLabel(lines[0]?.createdAt ?? detail.order.openedAt)} ·{' '}
                {detail.waiterName}
              </p>
            </header>

            <ul className="divide-y divide-dashed divide-slate-300">
              {lines.map((line) => (
                <li key={line.id} className="keep-together flex gap-3 py-2">
                  <span className="tnum w-8 shrink-0 text-lg font-bold">{line.qty}×</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">
                      {line.nameSnapshot}
                      {line.variantSnapshot ? ` (${line.variantSnapshot})` : ''}
                    </span>
                    {line.note ? (
                      <span className="block text-sm font-bold uppercase">** {line.note}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>

            {detail.order.notes ? (
              <p className="mt-2 border-t border-dashed border-slate-400 pt-2 text-sm font-semibold">
                {detail.order.notes}
              </p>
            ) : null}
          </div>
        ) : null}

        {detail && rounds.length === 0 ? (
          <p className="text-center text-sm text-slate-500">Nothing to send yet.</p>
        ) : null}
      </main>
    </div>
  )
}
