import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '../../components/AppShell'
import { Button, ErrorNote, Sheet, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { useAction, useAsync } from '../../lib/hooks'

const MAX_IMAGES = 10

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const max = 1400
      const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(source)
      resolve(canvas.toDataURL('image/jpeg', 0.72))
    }
    image.onerror = () => { URL.revokeObjectURL(source); reject(new Error(`Could not read ${file.name}.`)) }
    image.src = source
  })
}

/** Owner workflow for the image-only QR landing page. */
export default function SpecialsManager(): ReactNode {
  const state = useAsync(() => api.specials.gallery(), [])
  const action = useAction()
  const [images, setImages] = useState<string[]>([])
  const [savedImages, setSavedImages] = useState<string[]>([])
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [initialised, setInitialised] = useState(false)
  const [inputError, setInputError] = useState<string | null>(null)
  const imageCards = useRef<Map<number, HTMLDivElement>>(new Map())
  const dragIndex = useRef<number | null>(null)

  useEffect(() => {
    if (state.data && !initialised) {
      setImages(state.data.images)
      setSavedImages(state.data.images)
      setInitialised(true)
    }
  }, [initialised, state.data])

  const addImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length === 0) return
    if (images.length + files.length > MAX_IMAGES) {
      setInputError(`You can publish up to ${MAX_IMAGES} images.`)
      return
    }
    try {
      const next = await Promise.all(files.map(readImage))
      setInputError(null)
      setImages((current) => [...current, ...next])
    } catch (error) {
      setInputError(error instanceof Error ? error.message : 'Could not read the images.')
    }
  }

  const save = async () => {
    const result = await action.run(() => api.specials.saveGallery(images))
    if (result) {
      setImages(result.images)
      setSavedImages(result.images)
    }
  }

  const remove = (index: number) => setImages((current) => current.filter((_, item) => item !== index))
  const reorder = (from: number, to: number) => {
    if (from === to) return
    setImages((current) => {
      const next = [...current]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item!)
      return next
    })
  }

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>, index: number) => {
    if ((event.target as HTMLElement).closest('button')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragIndex.current = index
    setDraggingIndex(index)
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const from = dragIndex.current
    if (from === null) return
    const target = [...imageCards.current.entries()].find(([, card]) => {
      const rect = card.getBoundingClientRect()
      return event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom
    })?.[0]
    if (target === undefined || target === from) return
    reorder(from, target)
    dragIndex.current = target
    setDraggingIndex(target)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragIndex.current = null
    setDraggingIndex(null)
  }
  const dirty = JSON.stringify(images) !== JSON.stringify(savedImages)
  return (
    <AppShell title="Today&apos;s Special" subtitle="Upload images, arrange their order, and publish the live special menu." action={<div className="flex gap-2"><Link to="/special" target="_blank" className="min-h-11 rounded-xl bg-ink px-3 py-2 text-xs font-bold text-cream">View live specials</Link><button onClick={() => setShowQr(true)} className="min-h-11 rounded-xl bg-sand px-3 py-2 text-xs font-bold text-ink">QR code</button></div>}>
      {state.loading && !state.data ? <Spinner label="Loading gallery" /> : null}
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}
      {inputError ? <div className="mb-4"><ErrorNote message={inputError} /></div> : null}
      {action.error ? <div className="mb-4"><ErrorNote message={action.error} /></div> : null}

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold text-ink">Add live special images</h2>
        <p className="mt-1 text-xs text-slate-500">The first image is the landing image. Drag the images below to set the carousel order.</p>
        <label className="mt-4 flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-bold text-cream active:opacity-80">
          Add images
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={addImages} className="sr-only" />
        </label>
        <p className="mt-2 text-center text-xs text-slate-400">{images.length}/{MAX_IMAGES} images selected</p>
      </section>

      {images.length > 0 ? <section className="mb-5">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Drag to arrange</h2><span className="text-xs text-slate-400">Touch or drag · {images.length}/{MAX_IMAGES}</span></div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {images.map((image, index) => <div key={`${image.slice(0, 32)}-${index}`} ref={(card) => { if (card) imageCards.current.set(index, card); else imageCards.current.delete(index) }} onPointerDown={(event) => startDrag(event, index)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className={`relative aspect-[3/4] touch-none select-none overflow-hidden rounded-xl border-2 border-transparent bg-white ${draggingIndex === index ? 'opacity-40' : ''}`}><img draggable={false} src={image} alt={index === 0 ? 'Landing image' : `Carousel image ${index + 1}`} className="h-full w-full object-cover" /><span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{index === 0 ? 'Landing' : `Carousel ${index + 1}`}</span><button type="button" onClick={() => remove(index)} className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/65 text-lg text-white" aria-label={`Remove image ${index + 1}`}>×</button></div>)}
        </div>
      </section> : null}

      <Button size="lg" disabled={action.busy || !initialised || !dirty} onClick={save}>
        {action.busy ? <span className="inline-flex items-center gap-2"><span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Publishing…</span> : dirty ? "Publish Today's Special" : 'Published'}
      </Button>
      <Link to="/admin/specials/history" className="mt-4 block text-center text-sm font-semibold text-slate-600 underline">View past special menus</Link>
      {showQr ? <QrSheet onClose={() => setShowQr(false)} /> : null}
    </AppShell>
  )
}

function QrSheet({ onClose }: { onClose: () => void }): ReactNode {
  const state = useAsync(() => api.specials.qr(), [])
  return <Sheet open onClose={onClose} title="Today&apos;s Special QR code">
    {state.loading ? <Spinner label="Building the QR" /> : null}
    {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}
    {state.data ? <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4"><img src={state.data.dataUrl} alt="QR code for today&apos;s special" className="size-48" /><p className="break-all text-center text-xs text-slate-500">{state.data.url}</p></div> : null}
  </Sheet>
}
