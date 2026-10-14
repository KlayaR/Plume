// Manuscript: the scene on a sheet of paper in the middle of the room. The
// chapters slide in from the left edge and the AI panel (or Review) from the
// right, on hover, or stay open when pinned.
import { useEffect, useRef, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { ChevronLeft, FilePlus2, FolderPlus, GripVertical, Pin, PinOff, Trash2 } from 'lucide-react'
import { findScene, useStore } from '../store'
import type { Chapter, Entry, Scene, SceneStatus } from '../lib/types'
import { countWords } from '../lib/text'
import { allowedKinds, chapterLabels } from '../lib/chapters'
import Editor from '../editor/Editor'
import { useAI } from '../editor/actions'
import ContextPanel from './ContextPanel'
import ReviewPanel from './ReviewPanel'
import BookView, { Inline } from './BookView'
import ChatPanel, { ResizeHandle } from './ChatPanel'
import { ManuscriptToolbar } from './BottomBar'
import NotesPanel from './NotesPanel'
import { EntryEditor } from './BibleView'
import { countPlaceholders } from '../editor/marks'
import { useChat } from '../chat'
import { useT } from '../i18n'

export default function WritingView() {
  const book = useStore(s => s.book)!
  const sceneId = useStore(s => s.sceneId)
  const prefs = useStore(s => s.prefs)
  const hasProposal = useAI(s => s.hasProposal)
  const running = useAI(s => s.running)
  const chatting = useChat(s => s.streaming !== null)
  const [hoverL, setHoverL] = useState(false)
  const [hoverR, setHoverR] = useState(false)
  const t = useT()
  const found = findScene(book, sceneId)
  const openL = prefs.pinLeft || hoverL
  // The AI panel also comes out on its own while a reply streams or waits for a decision.
  const openR = prefs.pinRight || hoverR || hasProposal || !!running || chatting
  const setPrefs = useStore.getState().setPrefs
  // A new view only when what's shown changes: in the whole book, moving between chapters keeps it.
  const viewKey = !found ? '' : prefs.scope === 'book' ? 'book' : prefs.scope === 'scene' ? found.scene.id : found.chapter.id

  return (
    <div className="pl-manuscript" data-pin-left={prefs.pinLeft} data-pin-right={prefs.pinRight}>
      <ManuscriptToolbar />
      <div className={`pl-scroll ${prefs.split !== null ? 'pl-scroll-split' : ''}`}>
        {prefs.split !== null && found && <SplitPane />}
        {found ? (prefs.page ? <BookView key={viewKey} /> : <Sheet key={viewKey} />) :<div className="sk-empty" style={{ paddingTop: 80 }}>{t('Pick or add a scene on the left.')}</div>}
      </div>

      {!prefs.pinLeft && <div className="pl-hotzone pl-hotzone-left" onMouseEnter={() => setHoverL(true)} />}
      <aside className="pl-pane pl-pane-left" data-open={openL} data-pinned={prefs.pinLeft} onMouseLeave={() => setHoverL(false)} aria-label={t('Chapters and scenes')}>
        <ResizeHandle side="left" />
        <div className="pl-pane-head pl-pane-book">
          <button type="button" className="pl-quiet pl-backshelf" onClick={() => useStore.getState().close()} title={t('Switch book')}>
            <ChevronLeft size={15} /><span className="pl-pane-booktitle">{book.meta.title}</span>
          </button>
          <button type="button" className="pl-quiet pl-pin" aria-pressed={prefs.pinLeft} onClick={() => setPrefs({ pinLeft: !prefs.pinLeft })} title={t(prefs.pinLeft ? 'Unpin' : 'Pin open')}>
            {prefs.pinLeft ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
        </div>
        <div className="pl-pane-body"><SceneTree /></div>
      </aside>

      {found && (
        <>
          {!prefs.pinRight && <div className="pl-hotzone pl-hotzone-right" onMouseEnter={() => setHoverR(true)} />}
          <aside className="pl-pane pl-pane-right" data-open={openR} data-pinned={prefs.pinRight} onMouseLeave={() => setHoverR(false)}>
            <ResizeHandle side="right" />
            <PaneHead title={prefs.mode === 'review' ? t('Review') : (
              <span className="pl-switch pl-panetabs" role="group" aria-label="Claude">
                <button type="button" aria-pressed={prefs.rightTab === 'write'} onClick={() => setPrefs({ rightTab: 'write' })}>{t('Assistant')}</button>
                <button type="button" aria-pressed={prefs.rightTab === 'chat'} onClick={() => setPrefs({ rightTab: 'chat' })}>{t('Chat')}</button>
                <button type="button" aria-pressed={prefs.rightTab === 'notes'} onClick={() => setPrefs({ rightTab: 'notes' })}>{t('Notes')}</button>
              </span>
            )} pinned={prefs.pinRight} onPin={() => setPrefs({ pinRight: !prefs.pinRight })} />
            <div className="pl-pane-body pl-pane-grow">
              {prefs.mode === 'review' ? <ReviewPanel /> : prefs.rightTab === 'chat' ? <ChatPanel /> : prefs.rightTab === 'notes' ? <NotesPanel /> : <ContextPanel key={found.scene.id} />}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

function PaneHead({ title, pinned, onPin }: { title: React.ReactNode; pinned: boolean; onPin: () => void }) {
  const t = useT()
  return (
    <div className="pl-pane-head">
      {typeof title === 'string' ? <span className="pl-label">{title}</span> : title}
      <button type="button" className="pl-quiet pl-pin" aria-pressed={pinned} onClick={onPin} title={t(pinned ? 'Unpin' : 'Pin open')}>
        {pinned ? <PinOff size={14} /> : <Pin size={14} />}
      </button>
    </div>
  )
}

/** On NEO's sheet: the scene, the chapter or the whole book, every scene editable, separated by * * *. */
function Sheet() {
  const book = useStore(s => s.book)!
  const sceneId = useStore(s => s.sceneId)
  const prefs = useStore(s => s.prefs)
  const update = useStore(s => s.updateScene)
  const t = useT()
  const { chapter, scene: current } = findScene(book, sceneId)!
  const labels = chapterLabels(book.chapters, book.meta.language)
  const characters = book.entries.filter(e => e.type === 'character').sort((a, b) => a.name.localeCompare(b.name))
  const chapters = prefs.scope === 'book' ? book.chapters : [chapter]

  return (
    <div className={`pl-desk pl-paper-${prefs.paper}`}>
      <div className={`pl-sheet pl-sheet-free ${prefs.justify ? 'pl-justify' : ''}`}>
        {chapters.map(c => {
          const label = labels[book.chapters.indexOf(c)].label
          const scenes = prefs.scope === 'scene' ? [current] : c.scenes
          return (
            <div key={c.id} className="pl-sheet-chapter">
              <div className="pl-head">
                <div className="pl-head-chapter">{label}{c.title && c.title !== label ? ` · ${c.title}` : ''}</div>
              </div>
              {scenes.map(scene => <SheetScene key={scene.id} scene={scene} first={c.scenes[0]?.id === scene.id} solo={scenes.length === 1} characters={characters} update={update} t={t} active={scene.id === sceneId} />)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SheetScene({ scene, first, solo, active, characters, update, t }: {
  scene: Scene; first: boolean; solo: boolean; active: boolean; characters: Entry[]
  update: (id: string, patch: Partial<Scene>) => void; t: ReturnType<typeof useT>
}) {
  const prefs = useStore(s => s.prefs)
  const places = useStore(s => s.book!.entries.filter(e => e.type === 'place'))
  return (
          <section className={`pl-scene-block ${first ? 'pl-dropcap' : ''} ${active ? 'pl-scene-active' : ''}`}>
            {!first && !solo && <div className="pl-break" aria-label={t('Scene break')}>* * *</div>}
            {(prefs.showSceneTitle || prefs.showPov || prefs.showStatus || prefs.showWhere) && (
              <div className="pl-scene-head">
                {prefs.showSceneTitle && <input className="pl-head-scene" value={scene.title} onChange={e => update(scene.id, { title: e.target.value })} aria-label={t('Scene title')} />}
                {(prefs.showPov || prefs.showStatus || prefs.showWhere) && (
                  <div className="pl-head-meta">
                    {prefs.showPov && (
                      <select value={scene.pov ?? ''} onChange={e => update(scene.id, { pov: e.target.value || null })} aria-label={t('POV')} title={t('POV')}>
                        <option value="">{t('POV')} : {t('None')}</option>
                        {characters.map(c => <option key={c.slug} value={c.slug}>{t('POV')} : {c.name}</option>)}
                      </select>
                    )}
                    {prefs.showWhere && (
                      <>
                        <input className="pl-head-time" value={scene.time ?? ''} placeholder={t('Story time')} title={t('Story time')} onChange={e => update(scene.id, { time: e.target.value || undefined })} />
                        <select value={scene.place ?? ''} onChange={e => update(scene.id, { place: e.target.value || null })} aria-label={t('Place')} title={t('Place')}>
                          <option value="">{t('Place')} : {t('None')}</option>
                          {places.map(p => <option key={p.slug} value={p.slug}>{t('Place')} : {p.name}</option>)}
                        </select>
                      </>
                    )}
                    {prefs.showStatus && (
                      <select value={scene.status} onChange={e => update(scene.id, { status: e.target.value as SceneStatus })} aria-label={t('Status')} title={t('Status')}>
                        <option value="draft">{t('Draft')}</option><option value="revised">{t('Revised')}</option><option value="done">{t('Done')}</option>
                      </select>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* The plan card's note, in grey, above a scene that already has text (an empty scene shows it in place of the text). */}
            {scene.note?.trim() && scene.text.trim() && <div className="pl-scene-note" title={t('Card note (Plan)')}>{scene.note.trim()}</div>}
            <LazyEditor scene={scene} active={active} />
          </section>
  )
}

const KIND_NAMES = { chapter: 'Numbered chapter', prologue: 'Prologue', epilogue: 'Epilogue' }

function SceneTree() {
  const book = useStore(s => s.book)!
  const sceneId = useStore(s => s.sceneId)
  const st = useStore.getState
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const t = useT()
  const fr = book.meta.language === 'fr'
  const labels = chapterLabels(book.chapters, book.meta.language)

  const drop = (chapter: Chapter, index: number) => {
    if (drag) st().moveScene(drag, chapter.id, index)
    setDrag(null); setOver(null)
  }
  const remove = async (id: string, title: string) => {
    if (await ask(t('Move "{title}" to the book\'s trash folder?', { title }), { title: t('Remove scene'), kind: 'warning' })) st().removeScene(id)
  }
  const cycleKind = (c: Chapter, i: number) => {
    const kinds = allowedKinds(i, book.chapters.length)
    if (kinds.length < 2) return
    st().updateChapter(c.id, { kind: kinds[(kinds.indexOf(c.kind) + 1) % kinds.length] })
  }

  return (
    <nav className="pl-tree">
      {book.chapters.map((c, ci) => {
        const kinds = allowedKinds(ci, book.chapters.length)
        return (
          <div key={c.id} className="pl-chapter">
            <div
              className={`pl-chapter-head ${over === c.id ? 'pl-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setOver(c.id) }}
              onDragLeave={() => setOver(null)}
              onDrop={() => drop(c, c.scenes.length)}
            >
              <button type="button" className={`pl-chapter-num ${c.kind !== 'chapter' ? 'pl-kind' : ''}`} disabled={kinds.length < 2}
                title={kinds.length < 2 ? labels[ci].label : t('{kind}: click to switch ({kinds})', { kind: t(KIND_NAMES[c.kind]), kinds: kinds.map(k => t(KIND_NAMES[k])).join(' / ') })}
                onClick={() => cycleKind(c, ci)}>
                {c.kind === 'chapter' ? labels[ci].number : c.kind === 'prologue' ? 'P' : 'É'}
              </button>
              {c.scenes.some(s => countPlaceholders(s.text) > 0) && <span className="pl-redot" title={t('Placeholders to fill in this chapter')} />}
              <input className="pl-chapter-title" value={c.title} placeholder={t('Untitled')} onChange={e => st().updateChapter(c.id, { title: e.target.value })} aria-label={t('Chapter title')} />
              <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('New scene')}
                onClick={() => st().addScene(c.id, fr ? `Scène ${c.scenes.length + 1}` : `Scene ${c.scenes.length + 1}`)}>
                <FilePlus2 size={14} />
              </button>
            </div>
            {c.scenes.map((s, si) => (
              <div
                key={s.id}
                className={`pl-scene ${s.id === sceneId ? 'pl-active' : ''} ${over === s.id ? 'pl-over' : ''}`}
                draggable
                onDragStart={() => setDrag(s.id)}
                onDragEnd={() => { setDrag(null); setOver(null) }}
                onDragOver={e => { e.preventDefault(); setOver(s.id) }}
                onDragLeave={() => setOver(null)}
                onDrop={() => drop(c, si)}
                onClick={() => st().selectScene(s.id)}
              >
                <GripVertical size={12} className="pl-grip" />
                <span className={`pl-status pl-status-${s.status}`} title={t(s.status === 'draft' ? 'Draft' : s.status === 'revised' ? 'Revised' : 'Done')} />
                <span className="pl-scene-title">{s.title}</span>
                {countPlaceholders(s.text) > 0 && <span className="pl-redot" title={t('{n} placeholders to fill', { n: countPlaceholders(s.text) })} />}
                <span className="pl-scene-words">{countWords(s.text)}</span>
                <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon pl-hover" title={t('Remove scene')}
                  onClick={e => { e.stopPropagation(); remove(s.id, s.title) }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )
      })}
      <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm pl-addchapter"
        onClick={() => st().addChapter(`${fr ? 'Chapitre' : 'Chapter'} ${book.chapters.filter(c => c.kind === 'chapter').length + 1}`)}>
        <FolderPlus size={14} /> {t('New chapter')}
      </button>
    </nav>
  )
}

/** Split view: a second scene (to read) or a bible entry (to read or edit) beside the text. */
function SplitPane() {
  const book = useStore(s => s.book)!
  const split = useStore(s => s.prefs.split) ?? ''
  const t = useT()
  const set = (v: string | null) => useStore.getState().setPrefs({ split: v })
  const [kind, id] = split.split(':')
  const scene = kind === 'scene' ? book.chapters.flatMap(c => c.scenes).find(s => s.id === id) : undefined
  const entry = kind === 'entry' ? book.entries.find(e => e.slug === id) : undefined
  return (
    <div className="pl-splitpane">
      <div className="pl-row">
        <select className="sk-select sk-btn-sm pl-grow" value={split} onChange={e => set(e.target.value)}>
          <option value="">{t('Show beside the text…')}</option>
          <optgroup label={t('Scenes')}>
            {book.chapters.flatMap(c => c.scenes).map(s => <option key={s.id} value={`scene:${s.id}`}>{s.title}</option>)}
          </optgroup>
          <optgroup label={t('Bible')}>
            {book.entries.filter(e => e.type !== 'style').sort((a, b) => a.name.localeCompare(b.name)).map(e => <option key={e.slug} value={`entry:${e.slug}`}>{e.name}</option>)}
          </optgroup>
        </select>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => set(null)}>{t('Close')}</button>
      </div>
      {scene && (
        <div className="pl-splittext">
          <div className="pl-head-chapter">{scene.title}</div>
          {scene.text.split('\n').filter(p => p.trim()).map((p, i) => <p key={i}>{p}</p>)}
          <button type="button" className="sk-btn sk-btn-sm" onClick={() => useStore.getState().selectScene(scene.id)}>{t('Write in this scene')}</button>
        </div>
      )}
      {entry && <div className="pl-splitentry"><EntryEditor key={entry.slug} entry={entry} /></div>}
      {!scene && !entry && <p className="sk-hint">{t('Pick a scene to read, or a bible entry to read or edit, while you write.')}</p>}
    </div>
  )
}

/**
 * In the whole-book view, a scene far from the screen is plain text with the
 * same look; its editor is built when it gets within a screen or two of view,
 * or when it is the active scene. Keeps a long book light.
 */
function LazyEditor({ scene, active }: { scene: Scene; active: boolean }) {
  const [near, setNear] = useState(active)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (near || active) { setNear(true); return }
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return }
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setNear(true); io.disconnect() } }, { rootMargin: '1800px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [near, active])
  if (near || active) return <Editor scene={scene} />
  return (
    <div ref={box} className="pl-editor pl-lazy">
      <div className="cm-scroller"><div className="cm-content">
        {scene.text.split('\n').map((l, i) => <div key={i} className="cm-line">{l ? <Inline text={l} /> : '\u00a0'}</div>)}
      </div></div>
    </div>
  )
}
