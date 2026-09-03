import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { usePrintMode } from '../../components/BillPaper'
import { Button, ErrorNote, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import type { MenuGroup } from '../../lib/types'
import { useAuth } from '../../state/auth'

const GROUP_LABEL: Record<MenuGroup, string> = {
  breakfast: 'Breakfast',
  food: 'Food',
  bar: 'Bar',
  beverage: 'Drinks',
  dessert: 'Dessert',
}

/**
 * The price sign-off sheet. Every price in this system was read off a photograph
 * of the printed card, so before go-live the owner prints this, walks it against
 * the physical menu and writes in anything that is wrong. Transcribed prices get
 * checked, not trusted - and the blank column is where a correction goes.
 */
export default function Verify(): ReactNode {
  const { settings } = useAuth()
  const state = useAsync(() => api.menu.verificationSheet(), [])
  usePrintMode('a4')

  const sections = state.data?.sections ?? []
  const rows = sections.reduce((sum, section) => sum + section.rows.length, 0)
  const asks = sections.reduce(
    (sum, section) => sum + section.rows.filter((row) => row.price === 'ask').length,
    0,
  )

  return (
    <div className="min-h-dvh bg-cream">
      <header className="safe-top no-print sticky top-0 z-20 border-b border-ink-soft bg-ink text-cream">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-3">
          <Link to="/admin/more" className="min-h-11 px-1 text-lg" aria-label="Back">
            ‹
          </Link>
          <p className="flex-1 truncate text-sm font-bold">Price sign-off sheet</p>
          <Button size="md" className="bg-sand text-ink" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 py-4">
        {state.loading && !state.data ? <Spinner label="Building the sheet" /> : null}
        {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}

        {state.data ? (
          <>
            <div className="no-print mb-4 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold">
                {rows} prices across {sections.length} sections.
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Print this, tick each line against the printed card, and write the correct figure in
                the blank column where it differs. {asks} lines are priced at the table, so they have
                nothing to check.
              </p>
            </div>

            <div className="paper price-sheet mx-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <header className="mb-3 border-b border-slate-400 pb-2">
                <h1 className="text-base font-bold uppercase tracking-wide">
                  {settings?.restaurantName ?? 'Luretha & Pollys'} · price check
                </h1>
                <p className="text-xs">
                  {rows} prices · transcribed from the printed menu · tick or correct every line
                </p>
              </header>

              {sections.map((section) => (
                <section key={section.category} className="mb-3">
                  <h2 className="keep-together border-b border-slate-300 text-xs font-bold uppercase tracking-wider">
                    {section.category}
                    <span className="font-normal text-slate-500">
                      {' '}
                      · {GROUP_LABEL[section.group]}
                    </span>
                  </h2>
                  <ul>
                    {section.rows.map((row, index) => (
                      <li
                        key={`${row.name}-${row.detail ?? ''}-${index}`}
                        className="keep-together flex items-baseline gap-2 py-0.5 text-xs"
                      >
                        <span aria-hidden className="shrink-0 text-slate-400">
                          ☐
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {row.name}
                          {row.detail ? (
                            <span className="text-slate-500"> · {row.detail}</span>
                          ) : null}
                        </span>
                        <span className="tnum shrink-0 font-semibold">
                          {row.price === 'ask' ? (
                            <span className="font-normal italic text-slate-500">ask</span>
                          ) : (
                            `₹${row.price}`
                          )}
                        </span>
                        <span
                          aria-hidden
                          className="w-14 shrink-0 border-b border-dotted border-slate-400"
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              <footer className="keep-together mt-4 border-t border-slate-400 pt-3 text-xs">
                <p>
                  Checked by ______________________ &nbsp; Date ____________ &nbsp; Signature
                  ______________________
                </p>
                <p className="mt-1 text-slate-500">
                  Once signed, prices are entered under Menu and this sheet is the record of what was
                  agreed.
                </p>
              </footer>
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
