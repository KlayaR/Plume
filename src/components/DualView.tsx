// Two spaces side by side: the Manuscript beside the Bible, the Plan beside the
// Manuscript… The main one keeps the full tabs; the second sits on the right
// with a divider you can drag (double-click resets it).
import { useRef, useState } from 'react'
import { ArrowLeftRight, X } from 'lucide-react'
import { useStore, type View } from '../store'
import BibleView from './BibleView'
import PlanView from './PlanView'
import WritingView from './WritingView'
import { useT } from '../i18n'

export const VIEW_NAMES: Record<View, string> = { bible: 'Bible', plan: 'Plan', manuscript: 'Manuscript' }

export function ViewBody({ view }: { view: View }) {
  return view === 'bible' ? <BibleView /> : view === 'plan' ? <PlanView /> : <WritingView />
}

export default function DualView({ view, other }: { view: View; other: View }) {
  const width = useStore(s => s.prefs.dualW)
  const setPrefs = useStore(s => s.setPrefs)
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [drag, setDrag] = useState(false)
  const set = (x: number) => {
    const total = box.current?.clientWidth ?? window.innerWidth
    setPrefs({ dualW: Math.round(Math.max(320, Math.min(total - 420, x))) })
  }

  return (
    <div className="pl-dual" ref={box}>
      <div className="pl-dual-pane pl-dual-main"><ViewBody view={view} /></div>
      <div className={`pl-dual-resize ${drag ? 'pl-dragging' : ''}`} role="separator" aria-orientation="vertical" aria-label={t('Resize the pane')} title={t('Drag to resize; double-click to reset')}
        onPointerDown={e => { try { (e.target as HTMLElement).setPointerCapture(e.pointerId) } catch { /* synthetic event */ } dragging.current = true; setDrag(true); document.body.classList.add('pl-resizing') }}
        onPointerMove={e => { if (dragging.current && box.current) set(box.current.getBoundingClientRect().right - e.clientX) }}
        onPointerUp={() => { dragging.current = false; setDrag(false); document.body.classList.remove('pl-resizing') }}
        onDoubleClick={() => set(520)} />
      <div className="pl-dual-pane pl-dual-side" style={{ width }}>
        <div className="pl-dual-head">
          <span className="sk-label pl-grow">{t(VIEW_NAMES[other])}</span>
          <button type="button" className="pl-quiet" title={t('Swap the two views')} aria-label={t('Swap the two views')} onClick={() => { setPrefs({ dual: view }); useStore.getState().setView(other) }}><ArrowLeftRight size={14} /></button>
          <button type="button" className="pl-quiet" title={t('Close the second view')} aria-label={t('Close the second view')} onClick={() => setPrefs({ dual: null })}><X size={14} /></button>
        </div>
        <div className="pl-dual-body"><ViewBody view={other} /></div>
      </div>
    </div>
  )
}
