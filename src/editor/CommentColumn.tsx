// Comments beside the text: one column per scene, each card level with its passage,
// and those whose passage is gone together at the bottom of the scene. It shows only
// when the window has room beside the sheet; the Notes tab lists them all the same.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { X } from 'lucide-react'
import type { Comment, Scene } from '../lib/types'
import { placeComments, stackCards } from '../lib/comments'
import { locateQuote } from '../lib/text'
import { useStore } from '../store'
import { removeComment, updateComment } from '../writing'
import { useT } from '../i18n'

// What each column does when its editor moves or grows.
const listeners = new WeakMap<EditorView, () => void>()
export const commentColumnExt = EditorView.updateListener.of(u => {
  if (u.docChanged || u.geometryChanged || u.heightChanged || u.viewportChanged) listeners.get(u.view)?.()
})

const GAP = 14, MIN_WIDTH = 150, MAX_WIDTH = 260

interface Layout { ys: Record<string, number>; end: number; left: number; width: number }

const quoted = (quote: string) => `« ${quote.slice(0, 60)}${quote.length > 60 ? '…' : ''} »`

function Card({ scene, comment, view }: { scene: Scene; comment: Comment; view?: EditorView }) {
  const t = useT()
  const show = () => {
    if (!view) return
    const at = locateQuote(view.state.doc.toString(), comment.quote, comment.at)
    if (at >= 0) { view.dispatch({ selection: { anchor: at, head: at + comment.quote.length }, scrollIntoView: true }); view.focus() }
  }
  return (
    <div className="pl-cc-card">
      <div className="pl-row">
        {view
          ? <button type="button" className="pl-quiet pl-cc-quote pl-grow" title={t('Show in the text')} onClick={show}>{quoted(comment.quote)}</button>
          : <span className="pl-cc-quote pl-grow">{quoted(comment.quote)}</span>}
        <button type="button" className="pl-quiet" aria-label={t('Delete')} title={t('Delete')} onClick={() => removeComment(scene.id, comment.id)}><X size={12} /></button>
      </div>
      <textarea rows={1} className="pl-cc-text" value={comment.text} aria-label={t('Comments')} onChange={e => updateComment(scene.id, comment.id, e.target.value)} />
    </div>
  )
}

export default function CommentColumn({ view, scene }: { view: EditorView; scene: Scene }) {
  const t = useT()
  const on = useStore(s => s.prefs.commentColumn)
  const box = useRef<HTMLDivElement>(null)
  const measure = useRef(() => {})
  const comments = useRef(scene.comments)
  comments.current = scene.comments
  const [layout, setLayout] = useState<Layout | null>(null)

  useEffect(() => {
    const el = box.current
    const section = el?.parentElement
    const sheet = el?.closest('.pl-sheet-free')
    const scroll = el?.closest('.pl-scroll')
    if (!el || !section || !sheet || !scroll) return
    measure.current = () => view.requestMeasure({
      key: el,
      read: v => {
        const base = section.getBoundingClientRect()
        const right = sheet.getBoundingClientRect().right
        const ys: Record<string, number> = {}
        for (const { comment, at } of placeComments(v.state.doc.toString(), comments.current).placed) {
          ys[comment.id] = (v.coordsAtPos(at)?.top ?? v.documentTop + v.lineBlockAt(at).top) - base.top
        }
        return { ys, end: base.height, left: right - base.left + GAP, width: Math.min(MAX_WIDTH, scroll.getBoundingClientRect().right - right - 2 * GAP) }
      },
      write: next => setLayout(old => JSON.stringify(old) === JSON.stringify(next) ? old : next),
    })
    listeners.set(view, measure.current)
    const ro = new ResizeObserver(() => measure.current())
    ro.observe(scroll)
    return () => { listeners.delete(view); ro.disconnect(); measure.current = () => {} }
  }, [view])
  useEffect(() => measure.current(), [scene.comments, on])

  const { placed, orphans } = placeComments(scene.text, scene.comments)
  // Laid out once the cards are there to be measured. The group of orphans sits at the scene's end.
  useLayoutEffect(() => {
    if (!box.current || !layout) return
    box.current.querySelectorAll('textarea').forEach(el => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` })
    const cards = [...box.current.children] as HTMLElement[]
    const tops = stackCards(cards.map(c => ({ y: c.dataset.y ? Number(c.dataset.y) : layout.end - c.offsetHeight, height: c.offsetHeight })))
    cards.forEach((c, i) => { c.style.top = `${tops[i]}px` })
  })

  const show = on && !!layout && layout.width >= MIN_WIDTH
  return (
    <div ref={box} className="pl-cc" style={show ? { left: layout.left, width: layout.width } : { display: 'none' }}>
      {placed.map(({ comment }) => (
        <div key={comment.id} className="pl-cc-slot" data-y={layout?.ys[comment.id] ?? 0}><Card scene={scene} comment={comment} view={view} /></div>
      ))}
      {orphans.length > 0 && (
        <div className="pl-cc-slot pl-cc-gone">
          <span className="sk-hint">{t('Their passage is no longer in the text:')}</span>
          {orphans.map(c => <Card key={c.id} scene={scene} comment={c} />)}
        </div>
      )}
    </div>
  )
}
