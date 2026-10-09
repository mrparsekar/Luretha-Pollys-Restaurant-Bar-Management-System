import { useEffect, useState, type ReactNode } from 'react'

import { Empty, ErrorNote, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'

/** The public QR destination: one image immediately, with the rest swipeable. */
export default function TodaysSpecial(): ReactNode {
  const state = useAsync((signal) => api.specials.public({ signal }), [])
  const images = state.data?.images ?? []
  const [active, setActive] = useState(0)

  useEffect(() => setActive(0), [images.length])

  if (state.loading) return <div className="flex min-h-dvh items-center justify-center bg-black"><Spinner label="Loading today&apos;s special" /></div>
  if (state.error) return <div className="flex min-h-dvh items-center justify-center bg-black p-4"><ErrorNote message={state.error.message} onRetry={state.reload} /></div>
  if (images.length === 0) return <div className="flex min-h-dvh items-center justify-center bg-black p-4"><Empty title="No special published yet" hint="Check back soon." /></div>

  const previous = () => setActive((current) => (current - 1 + images.length) % images.length)
  const next = () => setActive((current) => (current + 1) % images.length)

  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-black">
      <section className="relative flex min-h-dvh w-full flex-col items-center justify-center">
        <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden">
          <img
            key={images[active]}
            src={images[active]}
            alt={`Today&apos;s special ${active + 1} of ${images.length}`}
            className="h-full w-full object-contain animate-rise-in"
            onTouchStart={(event) => { event.currentTarget.dataset.startX = String(event.touches[0]?.clientX ?? 0) }}
            onTouchEnd={(event) => {
              const start = Number(event.currentTarget.dataset.startX ?? 0)
              const delta = event.changedTouches[0]!.clientX - start
              if (Math.abs(delta) > 48) (delta > 0 ? previous : next)()
            }}
          />
          {images.length > 1 ? <>
            <button type="button" onClick={previous} aria-label="Previous special image" className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-2xl text-white backdrop-blur-sm">‹</button>
            <button type="button" onClick={next} aria-label="Next special image" className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-2xl text-white backdrop-blur-sm">›</button>
          </> : null}
        </div>
        {images.length > 1 ? <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2" aria-label="Special image navigation">
          {images.map((image, index) => <button key={image} type="button" onClick={() => setActive(index)} aria-label={`Show special image ${index + 1}`} className={`h-2 rounded-full transition-all ${index === active ? 'w-7 bg-[#f2b24a]' : 'w-2 bg-white/55'}`} />)}
        </div> : null}
      </section>
    </main>
  )
}
