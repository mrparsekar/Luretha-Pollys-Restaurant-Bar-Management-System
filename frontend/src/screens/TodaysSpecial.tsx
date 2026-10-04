import type { CSSProperties, ReactNode } from 'react'

import { Empty, ErrorNote, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'

/**
 * Stock photos (Pexels License - free for commercial use, no attribution
 * required) stand in for the owner's own signage until they have their own:
 * palms up top, a vivid sunset sea behind everything, a whitewashed plank
 * texture behind the list, real shells/starfish at the foot of it. See
 * frontend/public/images/.
 */
const PAGE_BACKGROUND: CSSProperties = {
  backgroundImage:
    "linear-gradient(to bottom, rgba(255,241,225,0.35), rgba(255,250,240,0.82) 50%, #fdf8ec 78%), url('/images/beach-bg.jpg')",
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}

const PALM_BANNER: CSSProperties = {
  backgroundImage: "url('/images/palm-frame.jpg')",
  backgroundSize: 'cover',
  backgroundPosition: 'center 30%',
  WebkitMaskImage: 'linear-gradient(to bottom, black 45%, transparent 95%)',
  maskImage: 'linear-gradient(to bottom, black 45%, transparent 95%)',
}

const PLANK_LIST: CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(255,252,242,0.88), rgba(255,252,242,0.88)), url('/images/wood-plank.jpg')",
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}

/** A small round "beach find" photo badge - real shell/starfish crops, not emoji. */
function Trinket({ src, position }: { src: string; position: string }): ReactNode {
  return (
    <span className="block size-9 overflow-hidden rounded-full shadow-inner ring-2 ring-white/90">
      <img
        src={src}
        alt=""
        aria-hidden
        className="h-full w-full object-cover"
        style={{ objectPosition: position }}
      />
    </span>
  )
}

/**
 * The page every table's QR code opens - one page for the whole restaurant, no
 * login, no ordering yet. A guest almost always lands here on their own phone
 * mid-scan. Styled after the owner's own beach-shack "Today's Special" board:
 * palms over open sky, a rope-edged wood sign, real shells and starfish
 * resting along the bottom.
 */
export default function TodaysSpecial(): ReactNode {
  const state = useAsync((signal) => api.specials.public({ signal }), [])

  return (
    <div className="relative min-h-dvh" style={PAGE_BACKGROUND}>
      <div className="relative h-56 w-full sm:h-64" style={PALM_BANNER} aria-hidden />

      <div className="relative z-10 mx-auto -mt-16 w-full max-w-sm px-4 pb-10 sm:-mt-20">
        {state.loading ? (
          <div className="flex justify-center py-10">
            <Spinner label="Loading today's special" />
          </div>
        ) : null}
        {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}

        {state.data ? (
          <div className="animate-rise-in">
            <div className="mx-auto w-fit max-w-full rounded-2xl bg-ink-soft/85 px-4 py-2 text-center shadow-lg backdrop-blur-sm">
              <p className="text-balance text-sm font-bold uppercase tracking-wide text-white">
                {state.data.restaurantName}
              </p>
              {state.data.tagline ? (
                <p className="mt-0.5 text-xs italic text-white/80">{state.data.tagline}</p>
              ) : null}
            </div>

            <div className="mt-5 rounded-[28px] bg-amber-800 p-1.5 shadow-[0_18px_44px_rgba(60,36,8,0.45)]">
              <div className="overflow-hidden rounded-[22px]">
                <div className="bg-gradient-to-b from-teal-900 to-teal-950 px-5 py-7 text-center">
                  <p className="flex items-center justify-center gap-2 font-serif text-xl italic text-white sm:text-2xl">
                    <span aria-hidden className="animate-twinkle text-amber-300">
                      ✦
                    </span>
                    Today&apos;s <span className="text-amber-300">Special</span>
                    <span
                      aria-hidden
                      className="animate-twinkle text-amber-300"
                      style={{ animationDelay: '1.2s' }}
                    >
                      ✦
                    </span>
                  </p>
                  <svg
                    aria-hidden
                    viewBox="0 0 120 10"
                    className="mx-auto mt-3 h-2.5 w-24 text-amber-300"
                  >
                    <path
                      d="M2 6 Q 30 -2, 60 6 T 118 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                <div style={PLANK_LIST}>
                  {state.data.items.length === 0 ? (
                    <div className="p-6">
                      <Empty title="No specials right now" hint="Check back later." />
                    </div>
                  ) : (
                    <ul className="divide-y divide-teal-900/10">
                      {state.data.items.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 px-5 py-4">
                          <span aria-hidden className="shrink-0 text-lg text-amber-600">
                            ★
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold text-ink">{item.name}</span>
                            {item.description ? (
                              <span className="mt-0.5 block text-sm text-slate-600">
                                {item.description}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div
                    aria-hidden
                    className="flex items-center justify-center gap-5 border-t border-teal-900/10 py-3"
                  >
                    <Trinket src="/images/shells.jpg" position="28% 45%" />
                    <Trinket src="/images/starfish.jpg" position="35% 50%" />
                    <Trinket src="/images/shells.jpg" position="63% 68%" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
