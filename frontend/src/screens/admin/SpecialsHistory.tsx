import { useState, type ReactNode } from 'react'

import { AppShell } from '../../components/AppShell'
import { Empty, ErrorNote, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/hooks'

function publishedLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

/** Read-only view of the image galleries retained during the last seven days. */
export default function SpecialsHistory(): ReactNode {
  const state = useAsync(() => api.specials.galleryHistory(), [])
  const galleries = state.data?.galleries ?? []
  const [selected, setSelected] = useState(0)
  const gallery = galleries[selected]

  return (
    <AppShell title="Past Special Menus" subtitle="Published image galleries kept for seven days.">
      {state.loading ? <Spinner label="Loading past specials" /> : null}
      {state.error ? <ErrorNote message={state.error.message} onRetry={state.reload} /> : null}
      {state.data && galleries.length === 0 ? <Empty title="No past special menus" hint="Published galleries will appear here." /> : null}
      {gallery ? <>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {galleries.map((item, index) => <button key={item.id} type="button" onClick={() => setSelected(index)} className={`shrink-0 rounded-xl px-3 py-2 text-left text-xs font-bold ${index === selected ? 'bg-ink text-cream' : 'bg-white text-slate-600'}`}><span className="block">{publishedLabel(item.publishedAt)}</span><span className="mt-0.5 block font-normal opacity-70">{item.images.length} images</span></button>)}
        </div>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {gallery.images.map((image, index) => <div key={image} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><img src={image} alt={`Past special image ${index + 1}`} className="aspect-[3/4] w-full object-cover" /><p className="p-2 text-xs font-semibold text-slate-600">{index === 0 ? 'Landing image' : `Carousel image ${index + 1}`}</p></div>)}
        </section>
      </> : null}
    </AppShell>
  )
}
