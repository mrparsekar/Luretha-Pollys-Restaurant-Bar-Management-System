import type { CSSProperties, ReactNode } from 'react'

import { Empty, ErrorNote } from '../components/ui'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'

/**
 * The page every table's QR code opens: the client's own photo of the
 * restaurant's physical signboard, with the live special list painted into
 * the blank plank area in the middle of that photo.
 */

const INK = '#0f4c3f'
const GOLD = '#f2b24a'

/** Board space is fixed, so a longer special list has to shrink to still fit without scrolling. */
const DENSITY_TIERS = [
  { max: 6, star: 'h-6 w-6 sm:h-7 sm:w-7', name: 'text-2xl sm:text-3xl', desc: 'text-base sm:text-lg', li: 'gap-3 px-1 py-1', ul: 'gap-1' },
  { max: 8, star: 'h-5 w-5 sm:h-6 sm:w-6', name: 'text-xl sm:text-2xl', desc: 'text-sm sm:text-base', li: 'gap-2 px-1 py-0.5', ul: 'gap-0.5' },
  { max: 10, star: 'h-4 w-4 sm:h-5 sm:w-5', name: 'text-base sm:text-lg', desc: 'text-xs sm:text-sm', li: 'gap-2 px-1 py-0', ul: 'gap-0' },
] as const

function densityFor(itemCount: number): (typeof DENSITY_TIERS)[number] {
  return DENSITY_TIERS.find((tier) => itemCount <= tier.max) ?? DENSITY_TIERS[2]
}

/** A clean five-point star, used as the list bullet. */
function Star({ className, style }: { className?: string; style?: CSSProperties }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} style={style}>
      <path
        fill="currentColor"
        d="M12 2.2 14.6 9 21.8 9.3 16.1 13.8 18 20.8 12 16.7 6 20.8 7.9 13.8 2.2 9.3 9.4 9Z"
      />
    </svg>
  )
}

export default function TodaysSpecial(): ReactNode {
  const state = useAsync((signal) => api.specials.public({ signal }), [])

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[#0b2a2a]">
      <img
        aria-hidden
        src="/images/special-board.jpg"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl"
      />

      <div className="relative w-full max-w-md" style={{ aspectRatio: '853 / 1280' }}>
        <img
          src="/images/special-board.jpg"
          alt="Luretha &amp; Pollys by Alex - Today's Special signboard"
          className="absolute inset-0 h-full w-full object-cover shadow-[0_0_60px_rgba(0,0,0,0.45)]"
        />

      <div
        className="absolute flex flex-col"
        style={{ left: '12.5%', right: '12.5%', top: '40%', bottom: '12%' }}
      >
        {state.loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className="flex gap-2">
              <Star className="h-6 w-6 animate-bounce" style={{ color: GOLD, animationDelay: '0ms' }} />
              <Star className="h-6 w-6 animate-bounce" style={{ color: GOLD, animationDelay: '150ms' }} />
              <Star className="h-6 w-6 animate-bounce" style={{ color: GOLD, animationDelay: '300ms' }} />
            </div>
            <p className="font-script text-lg" style={{ color: INK }}>
              Fetching today&apos;s special&hellip;
            </p>
          </div>
        ) : null}
        {state.error ? (
          <div className="flex flex-1 items-center justify-center">
            <ErrorNote message={state.error.message} onRetry={state.reload} />
          </div>
        ) : null}

        {state.data ? (
          state.data.items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <Empty title="No specials right now" hint="Check back later." />
            </div>
          ) : (
            (() => {
              const density = densityFor(state.data.items.length)
              return (
                <ul className={`animate-rise-in flex flex-1 flex-col justify-start overflow-y-auto py-1 pl-3 ${density.ul}`}>
                  {state.data.items.map((item) => (
                    <li key={item.id} className={`flex items-center ${density.li}`}>
                      <Star className={`${density.star} shrink-0`} style={{ color: GOLD }} />
                      <span className="min-w-0 flex-1">
                        <span className={`font-script block leading-tight ${density.name}`} style={{ color: INK }}>
                          {item.name}
                        </span>
                        {item.description ? (
                          <span className={`font-script mt-0.5 block leading-tight text-slate-600 ${density.desc}`}>
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            })()
          )
        ) : null}
        </div>
      </div>
    </div>
  )
}
