import { useState } from 'react'
import type { ReactNode } from 'react'

import { Badge, Button, Input, Money, Sheet } from './ui'
import { timeLabel } from '../lib/format'
import type { BillView, OrderItem } from '../lib/types'

/**
 * The lines of a tab, grouped by the round they were sent in - drinks first,
 * then food, in the order the evening actually happened. Shared by the waiter's
 * tab view and the owner's order screen so both read identically.
 */
export function OrderLines({
  items,
  onVoid,
}: {
  items: OrderItem[]
  onVoid?: (item: OrderItem, reason: string) => Promise<void> | void
}): ReactNode {
  const [voiding, setVoiding] = useState<OrderItem | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const rounds = [...new Set(items.map((item) => item.roundNo))].sort((a, b) => a - b)

  const confirm = async () => {
    if (!voiding || !onVoid || reason.trim().length < 3) return
    setBusy(true)
    try {
      await onVoid(voiding, reason.trim())
      setVoiding(null)
      setReason('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {rounds.map((roundNo) => {
        const lines = items.filter((item) => item.roundNo === roundNo)
        const at = lines[0]?.createdAt ?? null
        return (
          <section key={roundNo}>
            <h3 className="mb-1 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
              <span>Round {roundNo}</span>
              <span className="font-normal normal-case">{timeLabel(at)}</span>
            </h3>
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {lines.map((line) => (
                <li key={line.id} className="flex items-start gap-3 p-3">
                  <span
                    className={`tnum w-8 shrink-0 font-bold ${
                      line.status === 'void' ? 'text-slate-400' : ''
                    }`}
                  >
                    {line.qty}×
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold ${
                        line.status === 'void' ? 'text-slate-400 line-through' : ''
                      }`}
                    >
                      {line.nameSnapshot}
                      {line.variantSnapshot ? (
                        <span className="font-normal text-slate-500"> · {line.variantSnapshot}</span>
                      ) : null}
                    </p>
                    {line.note ? <p className="text-xs text-slate-500">{line.note}</p> : null}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {line.status === 'served' ? <Badge tone="green">Served</Badge> : null}
                      {line.status === 'void' ? (
                        <Badge tone="red">Void · {line.voidReason ?? 'no reason'}</Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Money
                      paise={line.unitPricePaise * line.qty}
                      className={`text-sm ${line.status === 'void' ? 'text-slate-400 line-through' : ''}`}
                    />
                    {onVoid && line.status !== 'void' ? (
                      <button
                        onClick={() => {
                          setVoiding(line)
                          setReason('')
                        }}
                        className="mt-1 block min-h-9 w-full text-xs font-semibold text-nonveg"
                      >
                        Void
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <Sheet open={Boolean(voiding)} onClose={() => setVoiding(null)} title="Void this line">
        <p className="mb-3 text-sm text-slate-600">
          {voiding?.qty}× {voiding?.nameSnapshot}
          {voiding?.variantSnapshot ? ` · ${voiding.variantSnapshot}` : ''}
        </p>
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason: wrong item, guest changed mind…"
          maxLength={200}
          className="mb-3"
        />
        <p className="mb-3 text-xs text-slate-500">
          Every void is logged with your name for the owner to review.
        </p>
        <Button
          variant="danger"
          size="lg"
          block
          disabled={busy || reason.trim().length < 3}
          onClick={confirm}
        >
          {busy ? 'Voiding…' : 'Void line'}
        </Button>
      </Sheet>
    </div>
  )
}

/** The totals block, straight from the API so screen and printed bill agree. */
export function Totals({ bill }: { bill: BillView }): ReactNode {
  return (
    <dl className="rounded-2xl border border-slate-200 bg-white p-4">
      {bill.rows.map((row) => (
        <div
          key={row.label}
          className={`flex items-center justify-between py-1 ${
            row.strong ? 'mt-1 border-t border-slate-200 pt-2 text-base font-bold' : 'text-sm'
          }`}
        >
          <dt>{row.label}</dt>
          <dd>
            <Money paise={row.amountPaise} strong={row.strong} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
