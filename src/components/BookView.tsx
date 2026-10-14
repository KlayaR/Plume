// Page view: the scene, the chapter or the whole book laid out as a printed
// book. Pages have their margins, paragraphs split across pages, each chapter
// opens on a new page, page numbers are optional (and run on through the book).
// Read-only: double-click to edit in Sheet.
//
// Layout is measured off-screen at the page's real size and font, then shown
// scaled (transform, so the line breaks stay exactly the same).
import { useEffect, useRef, useState } from 'react'
import { findScene, useStore } from '../store'
import { pageSizeFor } from '../lib/fonts'
import { BACK, FRONT, matterPages } from '../lib/matter'
import { chapterLabels } from '../lib/chapters'
import type { Chapter, Scene } from '../lib/types'
import { balanceSplit, parseInline } from '../lib/inline'
import { useT } from '../i18n'

interface Block {
  kind: 'para' | 'break'
  text: string
  sceneId: string
  first?: boolean // first paragraph of a scene: no indent
  drop?: boolean // the chapter's first paragraph: drop cap
  cont?: boolean // continues a paragraph from the previous page
  split?: boolean // goes on to the next page: last line justified
  center?: boolean // front matter: centred, no indent
}
interface Head { label: string; title: string }
interface Page { blocks: Block[]; opening: Head | null }
/** A run of text that starts on a new page: a chapter, or one scene of it. */
interface Part { head: Head | null; blocks: Block[] }

function partBlocks(scenes: Scene[], dropFirst: boolean): Block[] {
  const out: Block[] = []
  scenes.forEach((s, si) => {
    if (si > 0) out.push({ kind: 'break', text: '* * *', sceneId: s.id })
    s.text.split('\n').map(p => p.trim()).filter(Boolean).forEach((p, pi) => {
      out.push({ kind: 'para', text: p, sceneId: s.id, first: pi === 0, drop: dropFirst && si === 0 && pi === 0 })
    })
  })
  return out
}

const headOf = (c: Chapter, label: string): Head => ({ label, title: c.title && c.title !== label ? c.title : '' })

const dropAt = (b: Block) => (b.drop && !b.cont && /^\p{L}/u.test(b.text) ? 1 : 0)
const paraClass = (b: Block) => `pl-bk-p${b.first || b.cont ? ' pl-bk-noindent' : ''}${b.split ? ' pl-bk-split' : ''}${b.center ? ' pl-bk-center' : ''}`

/** Italics and bold as DOM (the same <em> and <strong> the page renders). */
function inlineNodes(text: string): Node[] {
  return parseInline(text).map(r => {
    const node = document.createTextNode(r.t)
    if (!r.i && !r.b) return node
    let el: HTMLElement = document.createElement(r.i ? 'em' : 'strong')
    el.append(node)
    if (r.i && r.b) { const outer = document.createElement('strong'); outer.append(el); el = outer }
    return el
  })
}

/** A paragraph's text with its italics and bold. */
export function Inline({ text }: { text: string }) {
  return <>{parseInline(text).map((r, i) => {
    if (!r.i && !r.b) return r.t
    const inner = r.i ? <em key={i}>{r.t}</em> : r.t
    return r.b ? <strong key={i}>{inner}</strong> : inner
  })}</>
}

/** The same DOM the page renders, for measuring. */
function fillPara(el: HTMLElement, b: Block) {
  el.className = paraClass(b)
  el.textContent = ''
  if (dropAt(b)) {
    const span = document.createElement('span')
    span.className = 'pl-bk-drop'
    span.textContent = b.text[0]
    el.append(span, ...inlineNodes(b.text.slice(1)))
  } else el.append(...inlineNodes(b.text))
}

function headDom(label: string, title: string) {
  const head = document.createElement('div')
  head.className = 'pl-bk-head'
  const num = head.appendChild(document.createElement('div'))
  num.className = 'pl-bk-num'
  num.textContent = label
  if (title) {
    const tt = head.appendChild(document.createElement('div'))
    tt.className = 'pl-bk-title'
    tt.textContent = title
  }
  return head
}

async function paginate(parts: Part[], host: HTMLElement, cancelled: () => boolean): Promise<Page[] | null> {
  await document.fonts.ready
  if (cancelled()) return null
  const pages: Page[] = []
  let body!: HTMLElement
  let cur!: Page
  const open = (opening: Head | null) => {
    host.textContent = ''
    const page = host.appendChild(document.createElement('div'))
    page.className = 'pl-bookpage'
    body = page.appendChild(document.createElement('div'))
    body.className = `pl-bk-body${opening ? ' pl-bk-opening' : ''}`
    if (opening) body.append(headDom(opening.label, opening.title))
    cur = { blocks: [], opening }
    pages.push(cur)
  }
  const fits = () => body.scrollHeight <= body.clientHeight + 1
  let lastYield = -1

  for (const part of parts) {
  if (cancelled()) return null
  open(part.head) // every chapter starts on a new page
  const queue = [...part.blocks]
  while (queue.length) {
    // A long book is laid out a few pages at a time, so the window stays responsive.
    if (pages.length % 3 === 0 && pages.length !== lastYield) { lastYield = pages.length; await new Promise(r => setTimeout(r, 0)); if (cancelled()) return null }
    const b = queue.shift()!
    const el = document.createElement(b.kind === 'break' ? 'div' : 'p')
    if (b.kind === 'break') { el.className = 'pl-bk-break'; el.textContent = b.text } else fillPara(el, b)
    body.append(el)
    if (fits() || (cur.blocks.length === 0 && b.kind === 'break')) {
      cur.blocks.push(b)
      // A one-line opening paragraph: the next one wraps beside the letter, without its indent, as in print.
      const letter = b.kind === 'para' && dropAt(b) ? el.querySelector('.pl-bk-drop') : null
      if (letter && letter.getBoundingClientRect().bottom > el.getBoundingClientRect().bottom + 1 && queue[0]?.kind === 'para') queue[0] = { ...queue[0], first: true }
      continue
    }
    if (b.kind === 'break') { el.remove(); open(null); queue.unshift(b); continue }

    // The paragraph runs over: keep as many words as fit, carry the rest over.
    const words = b.text.split(' ')
    let lo = 1, hi = words.length - 1, best = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      fillPara(el, { ...b, text: balanceSplit(words.slice(0, mid).join(' '), '')[0], split: true })
      if (fits()) { best = mid; lo = mid + 1 } else hi = mid - 1
    }
    if (best === 0) {
      el.remove()
      if (cur.blocks.length === 0) { fillPara(el, b); body.append(el); cur.blocks.push(b); continue } // taller than a page: leave it
      open(null)
      queue.unshift(b)
      continue
    }
    // A cut inside italics closes them on this page and opens them again on the next.
    const [headText, tailText] = balanceSplit(words.slice(0, best).join(' '), words.slice(best).join(' '))
    cur.blocks.push({ ...b, text: headText, split: true })
    open(null)
    queue.unshift({ ...b, text: tailText, cont: true, first: false, drop: false })
  }
  }
  host.textContent = ''
  return pages
}

export default function BookView({ scopeOverride }: { scopeOverride?: 'book' } = {}) {
  const book = useStore(s => s.book)!
  const sceneId = useStore(s => s.sceneId)
  const prefs = useStore(s => s.prefs)
  const t = useT()
  const { chapter, scene, label } = findScene(book, sceneId)!
  const size = pageSizeFor(prefs.pageSize, book.meta.language)
  const measure = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<Page[]>([])
  const labels = chapterLabels(book.chapters, book.meta.language)

  // What is laid out: the scene (its chapter's opening only if it's the first scene), the chapter, or every chapter.
  const scope = scopeOverride ?? prefs.scope
  const parts: Part[] = scope === 'book'
    ? [
      ...matterPages(book, FRONT).map(m => ({ head: null, blocks: m.paras.map(text => ({ kind: 'para' as const, text, sceneId: '', first: true, center: true })) })),
      ...book.chapters.flatMap((c, i) => [
        ...(c.part?.trim() ? [{ head: { label: c.part.trim(), title: '' }, blocks: [] as Block[] }] : []),
        { head: headOf(c, labels[i].label), blocks: partBlocks(c.scenes, true) },
      ]),
      ...matterPages(book, BACK).map(m => ({ head: { label: m.heading, title: '' }, blocks: m.paras.map(text => ({ kind: 'para' as const, text, sceneId: '', first: false })) })),
    ]
    : scope === 'scene'
      ? [{ head: chapter.scenes[0]?.id === scene.id ? headOf(chapter, label) : null, blocks: partBlocks([scene], chapter.scenes[0]?.id === scene.id) }]
      : [{ head: headOf(chapter, label), blocks: partBlocks(chapter.scenes, true) }]
  const textKey = JSON.stringify(parts)

  useEffect(() => {
    let off = false
    const timer = setTimeout(() => {
      paginate(parts, measure.current!, () => off).then(p => { if (p && !off) setPages(p) })
    }, 120)
    return () => { off = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textKey, prefs.font, size.w, size.h])

  // Go to the page where the current scene starts: on opening, and when another scene is picked in the tree.
  const shownFor = useRef<string | null>(null)
  useEffect(() => {
    if (!pages.length || shownFor.current === sceneId) return
    shownFor.current = sceneId
    const i = pages.findIndex(pg => pg.blocks.some(b => b.sceneId === sceneId))
    document.querySelectorAll('.pl-bookpage-slot')[Math.max(0, i)]?.scrollIntoView({ block: 'start' })
  }, [pages, sceneId])

  const edit = (id: string) => {
    if (!id) return
    useStore.getState().setPrefs({ page: false })
    useStore.getState().selectScene(id)
  }

  return (
    <div className={`pl-desk pl-paper-${prefs.paper}`}>
      <div className="pl-sheet-meta">{t(size.label)} · {pages.length} {t(pages.length > 1 ? 'pages' : 'page')} · {t('Double-click a paragraph to edit it')}</div>
      <div className="pl-bookpages" lang={book.meta.language}>
        {pages.map((pg, i) => (
          <div key={i} className="pl-bookpage-slot">
            <div className="pl-bookpage">
              <div className={`pl-bk-body${pg.opening ? ' pl-bk-opening' : ''}`}>
                {pg.opening && (
                  <div className="pl-bk-head">
                    <div className="pl-bk-num">{pg.opening.label}</div>
                    {pg.opening.title && <div className="pl-bk-title">{pg.opening.title}</div>}
                  </div>
                )}
                {pg.blocks.map((b, j) => b.kind === 'break'
                  ? <div key={j} className="pl-bk-break">{b.text}</div>
                  : (
                    <p key={j} className={paraClass(b)} onDoubleClick={() => edit(b.sceneId)}>
                      {dropAt(b) ? <><span className="pl-bk-drop">{b.text[0]}</span><Inline text={b.text.slice(1)} /></> : <Inline text={b.text} />}
                    </p>
                  ))}
              </div>
              {prefs.pageNumbers && !pg.opening && <div className="pl-bk-folio">{i + 1}</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="pl-bk-measure" ref={measure} lang={book.meta.language} aria-hidden="true" />
    </div>
  )
}
