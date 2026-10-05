import type { CSSProperties, ReactNode } from 'react'

import { Empty, ErrorNote, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'

/**
 * The page every table's QR code opens: a real beach photo behind a painted
 * sign. The backdrop (sky/sea, the palm drape, the plank textures) is real
 * photography - see frontend/public/images/. The sign graphics on top of it
 * (crest, lettering) are drawn, the way a real signboard would be painted
 * over a photo backdrop. Only the special list itself is live; everything
 * else is the fixed sign.
 */

const INK = '#16233f'
const TEAL = '#0f5c58'
const GOLD = '#f2b24a'

const PAGE_BACKGROUND: CSSProperties = {
  backgroundImage:
    "linear-gradient(to bottom, rgba(255,241,225,0.12), rgba(255,250,240,0.35) 55%, #f3dcae 92%), url('/images/beach-bg.jpg')",
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}

const PALM_BANNER: CSSProperties = {
  backgroundImage: "url('/images/palm-frame.jpg')",
  backgroundSize: 'cover',
  backgroundPosition: 'center 15%',
  WebkitMaskImage: 'linear-gradient(to bottom, black 35%, transparent 90%)',
  maskImage: 'linear-gradient(to bottom, black 35%, transparent 90%)',
}

const PLANK_LIST: CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(255,252,242,0.88), rgba(255,252,242,0.88)), url('/images/wood-plank.jpg')",
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}

const WOOD_FRAME: CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(91,58,30,0.82), rgba(58,37,20,0.88)), url('/images/wood-plank.jpg')",
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}

/** A single curved palm-frond blade, pointing out from the origin along `angle`. */
function Frond({
  angle,
  length,
  width = 11,
  color,
}: {
  angle: number
  length: number
  width?: number
  color: string
}): ReactNode {
  const rad = (angle * Math.PI) / 180
  const midX = Math.cos(rad) * length * 0.52
  const midY = Math.sin(rad) * length * 0.52
  const tipX = Math.cos(rad) * length
  const tipY = Math.sin(rad) * length
  const perpX = Math.cos(rad + Math.PI / 2) * width
  const perpY = Math.sin(rad + Math.PI / 2) * width
  const d = `M0 0 Q ${midX + perpX} ${midY + perpY} ${tipX} ${tipY} Q ${midX - perpX} ${midY - perpY} 0 0 Z`
  return <path d={d} fill={color} />
}

/** A stylised palm tree: curved trunk + a fan of fronds, used in the small brand mark. */
function PalmTree({ x, flip = false }: { x: number; flip?: boolean }): ReactNode {
  const angles = [-115, -90, -62, -35, -10]
  return (
    <g transform={`translate(${x} 92) scale(${flip ? -1 : 1} 1)`}>
      <path d="M0 0 C -3 -18, 2 -34, -1 -52" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
      <g transform="translate(-1 -52)">
        {angles.map((a) => (
          <Frond key={a} angle={a} length={30} width={6} color={INK} />
        ))}
      </g>
    </g>
  )
}

/** The horizontal crest above the wordmark: two palms, a rising sun, gulls, a wave. */
function BrandMark(): ReactNode {
  return (
    <svg aria-hidden viewBox="0 0 220 100" className="h-20 w-auto sm:h-24">
      <path d="M72 18 Q78 14 84 18 M84 18 Q90 14 96 18" stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M122 16 Q128 12 134 16 M134 16 Q140 12 146 16" stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="110" cy="54" r="21" fill={GOLD} />
      <path
        d="M70 68 Q90 58 110 68 T150 68"
        fill="none"
        stroke={TEAL}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M66 76 Q90 64 110 76 T154 76"
        fill="none"
        stroke={TEAL}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />
      <PalmTree x={26} />
      <PalmTree x={194} flip />
    </svg>
  )
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
    <div className="relative min-h-dvh" style={PAGE_BACKGROUND}>
      <div className="relative h-40 w-full sm:h-48" style={PALM_BANNER} aria-hidden />

      <div className="relative z-10 mx-auto -mt-8 flex w-full max-w-sm flex-col items-center px-5 pb-10 sm:-mt-10">
        <div className="flex flex-col items-center text-center">
          <BrandMark />
          <p className="mt-1 font-display text-[1.55rem] font-bold uppercase leading-tight tracking-wide text-ink-soft sm:text-3xl">
            Luretha &amp; Pollys
          </p>
          <p className="mt-1 font-byline text-2xl leading-none text-ink-soft/90 sm:text-[1.75rem]">by Alex</p>
          <svg aria-hidden viewBox="0 0 120 10" className="mt-1 h-2 w-20 text-teal-800/70">
            <path d="M2 6 Q 30 0, 60 6 T 118 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <p className="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-ink-soft/70">
            Bar &amp; Restaurant
          </p>
        </div>

        {state.loading ? (
          <div className="flex justify-center py-10">
            <Spinner label="Loading today's special" />
          </div>
        ) : null}
        {state.error ? (
          <div className="mt-6 w-full">
            <ErrorNote message={state.error.message} onRetry={state.reload} />
          </div>
        ) : null}

        {state.data ? (
          <div className="animate-rise-in mt-6 w-full">
            <div className="relative rounded-[24px] p-[5px] shadow-[0_18px_40px_rgba(60,36,8,0.4)]" style={WOOD_FRAME}>
              <svg
                aria-hidden
                viewBox="0 0 300 220"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                <defs>
                  <filter id="rough-edge" x="-10%" y="-10%" width="120%" height="120%">
                    <feTurbulence type="fractalNoise" baseFrequency="0.01 0.02" numOctaves="2" seed="4" result="n" />
                    <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" />
                  </filter>
                </defs>
                <rect
                  x="4"
                  y="4"
                  width="292"
                  height="212"
                  rx="18"
                  fill="none"
                  stroke="#2c1b0e"
                  strokeWidth="3"
                  opacity="0.55"
                  filter="url(#rough-edge)"
                />
              </svg>

              <div className="overflow-hidden rounded-[19px]">
                <div className="relative px-5 py-6 text-center" style={{ background: `linear-gradient(180deg, ${TEAL}, #083a38)` }}>
                  <span aria-hidden className="absolute left-5 top-2.5 size-2 rounded-full bg-black/40 shadow-[inset_0_1px_1px_rgba(0,0,0,0.6)]" />
                  <span aria-hidden className="absolute right-5 top-2.5 size-2 rounded-full bg-black/40 shadow-[inset_0_1px_1px_rgba(0,0,0,0.6)]" />

                  <p className="flex items-center justify-center gap-2 font-script text-3xl leading-none text-white sm:text-4xl">
                    <span aria-hidden className="animate-twinkle text-lg text-amber-300 sm:text-xl">
                      ✦
                    </span>
                    Today&apos;s <span style={{ color: GOLD }}>Special</span>
                    <span aria-hidden className="animate-twinkle text-lg text-amber-300 sm:text-xl" style={{ animationDelay: '1.2s' }}>
                      ✦
                    </span>
                  </p>
                  <div className="mt-1.5 flex items-center justify-center gap-3">
                    <svg aria-hidden viewBox="0 0 70 10" className="h-2.5 w-16">
                      <path d="M2 6 Q 18 0, 34 6 T 68 6" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
                    </svg>
                    <svg aria-hidden viewBox="0 0 70 10" className="h-2.5 w-16">
                      <path d="M2 6 Q 18 0, 34 6 T 68 6" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>

                <div style={PLANK_LIST}>
                  {state.data.items.length === 0 ? (
                    <div className="p-6">
                      <Empty title="No specials right now" hint="Check back later." />
                    </div>
                  ) : (
                    <ul className="divide-y divide-teal-900/10">
                      {state.data.items.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 px-5 py-3.5">
                          <Star className="h-5 w-5 shrink-0" style={{ color: GOLD }} />
                          <span className="min-w-0 flex-1">
                            <span className="block font-list text-lg font-bold text-ink-soft">{item.name}</span>
                            {item.description ? (
                              <span className="mt-0.5 block text-sm font-medium text-slate-600">{item.description}</span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
