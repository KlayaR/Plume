// Plan → Outline as a list: type the outline like text. Each chapter, scene and beat
// is a row; Enter adds one, Tab changes its level, Alt+arrows move it. Nothing is lost
// on the way: a row that holds more than its words refuses to become a smaller one.
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { findScene, useStore } from '../store'
import { type Book, type Scene } from '../lib/types'
import { chapterLabels } from '../lib/chapters'
import { countWords } from '../lib/text'
import { beatMove, beatRowId, chapterAsBeats, outlineRows, pastedLines, plainChapter, plainScene, stockSceneTitle, type OutlineRow } from '../lib/outliner'
import { showMenu } from '../contextMenu'
import { chapterMenu, sceneMenu } from '../menus'
import { t, useT } from '../i18n'

const st = useStore.getState
const group = (name: string, run: () => unknown) => st().groupChanges(name, run)
const refuse = (message: string) => st().notify('warn', message)

// --- Where the cursor goes next: once the rows are on screen -----------------------

let pending: { id: string; caret?: number; index?: number } | null = null

function settleFocus() {
  if (!pending) return
  const el = document.querySelector<HTMLTextAreaElement>(`[data-row="${CSS.escape(pending.id)}"]`)
    ?? (pending.index != null ? [...document.querySelectorAll<HTMLTextAreaElement>('[data-row]')].slice(0, pending.index + 1).pop() : null)
  if (!el) return
  const at = Math.min(pending.caret ?? el.value.length, el.value.length)
  pending = null
  el.focus()
  el.setSelectionRange(at, at)
  el.scrollIntoView({ block: 'nearest' })
}
function focusRow(id: string, caret?: number, index?: number) {
  pending = { id, caret, index }
  setTimeout(settleFocus)
}

// --- What the keys do ---------------------------------------------------------------

function setText(row: OutlineRow, text: string) {
  if (row.level === 0) return st().updateChapter(row.chapter, { title: text })
  if (row.level === 1) return st().updateScene(row.scene!, { title: text })
  const s = findScene(st().book, row.scene!)?.scene
  if (s) st().updateScene(s.id, { beats: (s.beats ?? []).map((b, i) => (i === row.beat ? text : b)) })
}

// Rows made here and left empty go away when you leave the list.
const created = new Set<string>()

function newScene(chapter: string, at: number, title: string, patch?: Partial<Scene>) {
  const id = st().addScene(chapter, title, { stay: true })
  created.add(id)
  if (patch) st().updateScene(id, patch)
  st().moveScene(id, chapter, at)
  return id
}

/** Takes up the rows typed and left empty, and empty beats. */
async function sweep() {
  for (const c of st().book?.chapters ?? []) {
    for (const s of c.scenes) {
      const beats = (s.beats ?? []).filter(b => b.trim())
      if (beats.length !== (s.beats ?? []).length) st().updateScene(s.id, { beats })
      if (created.delete(s.id) && !s.title.trim() && !beats.length && plainScene(s)) await st().removeScene(s.id, { quiet: true })
    }
  }
  for (const c of st().book?.chapters ?? []) {
    if (created.delete(c.id) && !c.title.trim() && !c.scenes.length && plainChapter(c)) await st().removeChapter(c.id, { quiet: true })
  }
}

/** A new row below: the text after the cursor goes with it, at the level of what follows. */
function enter(row: OutlineRow, from: number, to: number) {
  const found = row.scene ? findScene(st().book, row.scene) : null
  // An empty row steps up instead, as Enter does in the manuscript.
  if (!row.text.trim() && (row.level === 2 || (row.level === 1 && found && !found.scene.beats?.length && plainScene(found.scene)))) return outdent(row)
  const before = row.text.slice(0, from).trimEnd()
  const after = row.text.slice(to).trimStart()
  group(t('New row'), () => {
    if (before !== row.text) setText(row, before)
    if (row.level === 0) return focusRow(newScene(row.chapter, 0, after), 0)
    if (!found) return
    const beats = found.scene.beats ?? []
    if (row.level === 1 && !beats.length) return focusRow(newScene(found.chapter.id, found.index + 1, after), 0)
    const at = row.level === 1 ? 0 : row.beat! + 1
    // Read again: the row's own text may have just changed.
    const now = findScene(st().book, found.scene.id)!.scene.beats ?? []
    st().updateScene(found.scene.id, { beats: [...now.slice(0, at), after, ...now.slice(at)] })
    focusRow(beatRowId(found.scene.id, at), 0)
  })
}

/** Tab: a chapter becomes a scene of the chapter above, a scene a beat of the scene above. */
function indent(row: OutlineRow) {
  const book = st().book!
  if (row.level === 1) {
    const found = findScene(book, row.scene!)
    const above = found?.chapter.scenes[found.index - 1]
    if (!found || !above) return refuse(t('Nothing above to put it under.'))
    const s = found.scene
    if (!plainScene(s, above) || book.meta.structure.beats.some(b => b.sceneId === s.id)) return refuse(t('“{title}” has text or notes, which a beat can’t hold.', { title: s.title }))
    const at = above.beats?.length ?? 0
    group(t('Change of level'), async () => {
      st().updateScene(above.id, { beats: [...(above.beats ?? []), s.title, ...(s.beats ?? [])] })
      focusRow(beatRowId(above.id, at))
      await st().removeScene(s.id, { quiet: true })
    })
  }
  if (row.level === 0) {
    const i = book.chapters.findIndex(c => c.id === row.chapter)
    const c = book.chapters[i], above = book.chapters[i - 1]
    if (!above) return refuse(t('Nothing above to put it under.'))
    if (!plainChapter(c) || !c.scenes.every(s => plainScene(s))) return refuse(t('“{title}” has text or notes that a scene can’t hold. To join two chapters, use Merge in the cards.', { title: c.title }))
    group(t('Change of level'), async () => {
      const id = st().addScene(above.id, c.title, { stay: true })
      st().updateScene(id, { beats: chapterAsBeats(c) })
      focusRow(id)
      await st().removeChapter(c.id, { quiet: true })
    })
  }
}

/** Shift+Tab: a beat becomes a new scene, a scene a new chapter. What follows it at its level comes along. */
function outdent(row: OutlineRow) {
  const book = st().book!
  const found = row.scene ? findScene(book, row.scene) : null
  if (!found) return
  const s = found.scene
  if (row.level === 2) {
    const beats = s.beats ?? []
    group(t('Change of level'), () => {
      const id = newScene(found.chapter.id, found.index + 1, beats[row.beat!], { beats: beats.slice(row.beat! + 1), pov: s.pov, place: s.place, time: s.time, cast: s.cast })
      st().updateScene(s.id, { beats: beats.slice(0, row.beat!) })
      focusRow(id)
    })
  }
  if (row.level === 1) {
    const plain = plainScene(s) && !book.meta.structure.beats.some(b => b.sceneId === s.id)
    group(t('Change of level'), async () => {
      const id = st().addChapter(s.title, { stay: true, empty: true })
      created.add(id)
      st().moveChapter(id, book.chapters.indexOf(found.chapter) + 1)
      focusRow(id)
      let at = 0
      // A plain card is only its words: its title names the chapter, its beats become scenes.
      if (plain) (s.beats ?? []).forEach(b => newScene(id, at++, b))
      else st().moveScene(s.id, id, at++)
      found.chapter.scenes.slice(found.index + 1).forEach(x => st().moveScene(x.id, id, at++))
      if (plain) await st().removeScene(s.id, { quiet: true })
    })
  }
}

function moveRow(row: OutlineRow, dir: -1 | 1, caret: number) {
  const book = st().book!
  if (row.level === 0) {
    const to = book.chapters.findIndex(c => c.id === row.chapter) + dir
    if (to < 0 || to >= book.chapters.length) return
    st().moveChapter(row.chapter, to)
    return focusRow(row.id, caret)
  }
  const found = findScene(book, row.scene!)
  if (!found) return
  if (row.level === 1) {
    const to = found.index + dir
    const other = book.chapters[book.chapters.indexOf(found.chapter) + dir]
    if (to >= 0 && to < found.chapter.scenes.length) st().moveScene(found.scene.id, found.chapter.id, to)
    else if (other) st().moveScene(found.scene.id, other.id, dir < 0 ? other.scenes.length : 0)
    else return
    return focusRow(row.id, caret)
  }
  const land = beatMove(book, found.scene.id, row.beat!, dir)
  if (!land) return
  const beats = [...found.scene.beats ?? []]
  const [text] = beats.splice(row.beat!, 1)
  group(t('Row moved'), () => {
    if (land.scene.id === found.scene.id) beats.splice(land.at, 0, text)
    else {
      const there = [...land.scene.beats ?? []]
      there.splice(land.at, 0, text)
      st().updateScene(land.scene.id, { beats: there })
    }
    st().updateScene(found.scene.id, { beats })
  })
  focusRow(beatRowId(land.scene.id, land.at), caret)
}

/** Backspace on an empty row, if it holds nothing else. */
function removeRow(row: OutlineRow): boolean {
  const book = st().book!
  const rows = outlineRows(book)
  const i = rows.findIndex(r => r.id === row.id)
  const above = rows[i - 1]
  const go = () => { if (above) focusRow(above.id) }
  if (row.level === 2) {
    const s = findScene(book, row.scene!)?.scene
    if (!s) return false
    st().updateScene(s.id, { beats: (s.beats ?? []).filter((_, k) => k !== row.beat) })
    go()
    return true
  }
  if (row.level === 1) {
    const s = findScene(book, row.scene!)?.scene
    if (!s || s.beats?.length || !plainScene(s) || book.meta.structure.beats.some(b => b.sceneId === s.id)) return false
    st().removeScene(s.id, { quiet: true })
    go()
    return true
  }
  const c = book.chapters.find(x => x.id === row.chapter)
  if (!c || !plainChapter(c) || !c.scenes.every(s => plainScene(s) && !s.beats?.length && stockSceneTitle(s.title))) return false
  st().removeChapter(c.id, { quiet: true })
  go()
  return true
}

function pasteRows(row: OutlineRow, e: React.ClipboardEvent<HTMLTextAreaElement>) {
  const lines = pastedLines(e.clipboardData.getData('text'))
  if (lines.length < 2) return
  e.preventDefault()
  const { selectionStart: from, selectionEnd: to } = e.currentTarget
  const rest = lines.slice(1)
  const found = row.scene ? findScene(st().book, row.scene) : null
  group(t('New row'), () => {
    setText(row, row.text.slice(0, from) + lines[0] + row.text.slice(to))
    if (row.level === 0) rest.forEach((l, k) => focusRow(newScene(row.chapter, k, l)))
    else if (found && row.level === 1) rest.forEach((l, k) => focusRow(newScene(found.chapter.id, found.index + 1 + k, l)))
    else if (found) {
      const s = findScene(st().book, found.scene.id)!.scene
      const beats = [...s.beats ?? []]
      beats.splice(row.beat! + 1, 0, ...rest)
      st().updateScene(s.id, { beats })
      focusRow(beatRowId(s.id, row.beat! + rest.length))
    }
  })
}

/** Ctrl+Z here undoes what the list did: the box's own undo knows nothing of the rows. */
function undoRow(row: OutlineRow, which: 'undoChange' | 'redoChange') {
  const index = outlineRows(st().book!).findIndex(r => r.id === row.id)
  st()[which]()
  focusRow(row.id, undefined, index)
  // A row that was just made may go only once its file is in the trash.
  setTimeout(() => { if (document.activeElement === document.body) focusRow(row.id, undefined, index) }, 250)
}

// --- The rows ------------------------------------------------------------------------

/** How tall the box's text is up to the end of the word at `at`: which of its wrapped lines that is. */
function heightUpTo(el: HTMLTextAreaElement, at: number) {
  const probe = el.cloneNode() as HTMLTextAreaElement
  probe.removeAttribute('data-row')
  probe.value = el.value.slice(0, at) + (/^\S*/.exec(el.value.slice(at))?.[0] ?? '')
  probe.style.cssText = `position: fixed; visibility: hidden; height: auto; flex: none; width: ${el.offsetWidth}px`
  el.after(probe)
  const height = probe.scrollHeight
  probe.remove()
  return height
}

function keys(e: React.KeyboardEvent<HTMLTextAreaElement>, row: OutlineRow, openNote: (id: string) => void) {
  if (e.nativeEvent.isComposing) return
  const el = e.currentTarget
  const ctrl = e.ctrlKey || e.metaKey
  const take = () => { e.preventDefault(); e.stopPropagation() }
  const key = e.key.toLowerCase()
  if (ctrl && !e.altKey && (key === 'z' || key === 'y')) { take(); undoRow(row, key === 'y' || e.shiftKey ? 'redoChange' : 'undoChange') }
  else if (ctrl && key === 'enter') { take(); openNote(row.scene ?? row.chapter) }
  else if (key === 'enter') { take(); enter(row, el.selectionStart, el.selectionEnd) }
  else if (key === 'tab') { take(); if (e.shiftKey) outdent(row); else indent(row) }
  else if (e.altKey && (key === 'arrowup' || key === 'arrowdown')) { take(); moveRow(row, key === 'arrowup' ? -1 : 1, el.selectionStart) }
  else if (!e.altKey && !ctrl && !e.shiftKey && (key === 'arrowup' || key === 'arrowdown')) {
    // Inside a row that wraps, the arrows move as usual; on its first or last line they leave it.
    const at = el.selectionStart
    if (heightUpTo(el, at) !== heightUpTo(el, key === 'arrowup' ? 0 : el.value.length)) return
    const rows = outlineRows(st().book!)
    const next = rows[rows.findIndex(r => r.id === row.id) + (key === 'arrowup' ? -1 : 1)]
    if (!next) return
    take()
    focusRow(next.id, at)
  }
  else if (key === 'backspace' && !el.value && removeRow(row)) take()
  else if (key === 'escape') { take(); el.blur() }
}

const fit = (el: HTMLTextAreaElement | null) => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` } }

interface RowProps { row: OutlineRow; label?: string; words: number; note?: string; noteOpen: boolean; onNote: (id: string | null) => void }

const Row = memo(function Row({ row, label, words, note, noteOpen, onNote }: RowProps) {
  const t = useT()
  const box = useRef<HTMLTextAreaElement>(null)
  const noteBox = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => fit(box.current), [row.text])
  useLayoutEffect(() => { fit(noteBox.current); if (noteOpen) noteBox.current?.focus() }, [noteOpen])
  const closeNote = () => { onNote(null); focusRow(row.id) }
  const setNote = (value: string) => { if (row.level === 0) st().updateChapter(row.chapter, { goal: value }); else st().updateScene(row.scene!, { note: value }) }
  const placeholder = row.level === 0 ? t('Chapter title') : row.level === 1 ? t('Scene title') : t('A beat')
  const menu = (e: React.MouseEvent) => { if (row.level === 0) showMenu(e, chapterMenu(row.chapter)); else if (row.level === 1) showMenu(e, sceneMenu(row.scene!, { card: true })) }
  return (
    <div className={`pl-li pl-li-${row.level}`} onContextMenu={menu}>
      <div className="pl-li-main">
        {label && <span className="pl-li-num">{label}</span>}
        {row.level === 2 && <span className="pl-li-dot" aria-hidden="true">•</span>}
        <textarea ref={box} rows={1} data-row={row.id} className="pl-li-text" value={row.text} placeholder={placeholder} aria-label={placeholder}
          onChange={e => setText(row, e.target.value.replace(/\s*\n\s*/g, ' '))} onKeyDown={e => keys(e, row, onNote)} onPaste={e => pasteRows(row, e)} />
        {words > 0 && <span className="pl-li-words">{t('{n} words', { n: words.toLocaleString() })}</span>}
      </div>
      {noteOpen
        ? <textarea ref={noteBox} className="sk-input pl-li-notebox" rows={2} value={note ?? ''} placeholder={row.level === 0 ? t('What the point-of-view character wants right now') : t('What happens: who wants what, what stands in the way, what changes')}
            onChange={e => { setNote(e.target.value); fit(e.target) }} onBlur={() => onNote(null)}
            onKeyDown={e => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); e.stopPropagation(); closeNote() } }} />
        : note?.trim() && <button type="button" className="pl-quiet pl-li-note" onClick={() => onNote(row.id)}>{note}</button>}
    </div>
  )
}, (a, b) => a.row.id === b.row.id && a.row.text === b.row.text && a.row.chapter === b.row.chapter && a.label === b.label && a.words === b.words && a.note === b.note && a.noteOpen === b.noteOpen)

// A scene's count is kept while its text stays the same: rows are typed in, books are long.
const counted = new Map<string, [string, number]>()
function wordsIn(s: Scene) {
  const known = counted.get(s.id)
  if (known?.[0] === s.text) return known[1]
  const n = countWords(s.text)
  counted.set(s.id, [s.text, n])
  return n
}

export default function OutlineList({ book }: { book: Book }) {
  const t = useT()
  const [noteOpen, setNoteOpen] = useState<string | null>(null)
  useLayoutEffect(settleFocus)
  useEffect(() => () => { sweep().finally(() => created.clear()) }, [])
  const labels = chapterLabels(book.chapters, book.meta.language)
  const addChapter = () => {
    const id = st().addChapter('', { stay: true, empty: true })
    created.add(id)
    focusRow(id)
  }
  return (
    <div className="pl-li-list" onBlur={e => { if (document.hasFocus() && !e.currentTarget.contains(e.relatedTarget as Node | null)) sweep() }}>
      {outlineRows(book).map(row => {
        const c = book.chapters.find(x => x.id === row.chapter)!
        const s = row.level === 1 ? c.scenes.find(x => x.id === row.scene) : undefined
        return <Row key={row.id} row={row} label={row.level === 0 ? labels[book.chapters.indexOf(c)].label : undefined} onNote={setNoteOpen} noteOpen={noteOpen === row.id}
          words={row.level === 0 ? c.scenes.reduce((n, x) => n + wordsIn(x), 0) : s ? wordsIn(s) : 0} note={row.level === 0 ? c.goal : s?.note} />
      })}
      <button type="button" className="sk-btn sk-btn-ghost pl-ol-addch" onClick={addChapter}><Plus size={14} /> {t('Chapter')}</button>
      <span className="sk-hint">{t('Enter: a new row. Tab and Shift+Tab: chapter, scene, beat. Alt+Up and Alt+Down: move. Ctrl+Enter: its note.')}</span>
    </div>
  )
}
