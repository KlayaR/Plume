// One scene's editor. A chapter shows one per scene; the scene you are in is
// the "active" one: the AI panel, Accept/Discard and the counters follow it.
import { useEffect, useRef, useState } from 'react'
import { Compartment, EditorState, RangeSetBuilder, StateField } from '@codemirror/state'
import { Decoration, EditorView, highlightActiveLine, keymap, placeholder, showTooltip, ViewPlugin, type DecorationSet, type Tooltip, type ViewUpdate } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { findScene, useStore } from '../store'
import { locateQuote } from '../lib/text'
import { t } from '../i18n'
import type { Entry, Lang, Scene } from '../lib/types'
import { buildMatcher, findMentions } from '../lib/context'
import { ltCheck, ltLanguage } from '../lib/languagetool'
import { languageToolExt, refreshLT } from './lt'
import { showMenu } from '../contextMenu'
import { editorMenu } from '../menus'
import { enterStartsScene } from '../lib/chapters'
import { proposalField, sceneExtensions, setNames, setProposal } from './cm'
import { captureExt } from './captures'
import { draftExt, useDraft } from './draft'
import CommentColumn, { commentColumnExt } from './CommentColumn'
import { accept, discard, fillPlaceholder, getEditorView, keepProposal, runAction, setEditorView, syncProposalState, takeProposal, useAI } from './actions'
import { changesField, inlineExt, marksExt, placeholderExt, setChanges, setHighlights, trackedChangesExt, unknownNamesExt, type Highlight } from './marks'
import { takePending, useEdit } from '../edit'
import type { Comment, EntryType } from '../lib/types'
import { cutToDarlings } from '../writing'
import { useReview } from '../review'
import { edMarksExt, setEdMarks } from './edmarks'
import { ignoreKey, sceneMarks } from '../lib/editing'
import { occurrences, REPORTS } from '../lib/review'
import { isLitRPG, isLocked, isSystemLine, maskSystem } from '../lib/serial'

// LitRPG system windows: lines starting with "|" drawn as a box (they stay plain text in the file).
const systemLine = Decoration.line({ class: 'cm-system' })
const systemLinesExt = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view) }
  build(view: EditorView) {
    const b = new RangeSetBuilder<Decoration>()
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos)
        if (isSystemLine(line.text)) b.add(line.from, line.from, systemLine)
        pos = line.to + 1
      }
    }
    return b.finish()
  }
}, { decorations: v => v.decorations })

/** The findings of the Review report chosen in the panel, on one scene's text. */
function reviewHighlights(text: string, report: string | null, ai: { quote: string; note: string }[]): Highlight[] {
  const book = useStore.getState().book
  if (!report || !book) return []
  if (report === 'ai') {
    const out: Highlight[] = []
    for (const f of ai) {
      const at = f.quote ? text.indexOf(f.quote) : -1
      if (at >= 0) out.push({ from: at, to: at + f.quote.length, cls: 'cm-review-ai', title: f.note })
    }
    return out
  }
  if (report.startsWith('word:')) return occurrences(text, report.slice(5)).map(f => ({ ...f, cls: 'cm-review' }))
  const def = REPORTS.find(r => r.id === report)
  return def ? def.find(isLitRPG(book) ? maskSystem(text) : text, book.meta.language, book).map(f => ({ from: f.from, to: f.to, cls: `cm-review cm-review-${def.category}`, title: f.note })) : []
}

// The bible matcher for unknown-name detection, rebuilt only when the entries change.
let matcherCache: { entries: Entry[] | null; matcher: ReturnType<typeof buildMatcher> } = { entries: null, matcher: buildMatcher([]) }
const currentMatcher = () => {
  const entries = useStore.getState().book?.entries ?? []
  if (matcherCache.entries !== entries) matcherCache = { entries, matcher: buildMatcher(entries, true) }
  return matcherCache.matcher
}

const unknown = unknownNamesExt({
  matcher: currentMatcher,
  ignored: () => useStore.getState().book?.meta.ignored ?? [],
  add: (name: string, type: EntryType) => {
    const st = useStore.getState()
    const e = st.addEntry(type, name)
    st.notify('ok', t('{name} added to the bible.', { name }), { label: t('Open'), run: () => useStore.getState().showEntry(e.slug) })
  },
  ignore: (name: string) => {
    const st = useStore.getState()
    st.updateMeta({ ignored: [...(st.book?.meta.ignored ?? []), name] })
  },
})

/** Margin comments, found again in the text by their quote. */
export function commentHighlights(text: string, comments: Comment[] | undefined): Highlight[] {
  const out: Highlight[] = []
  for (const c of comments ?? []) {
    const at = locateQuote(text, c.quote, c.at)
    if (at >= 0) out.push({ from: at, to: at + c.quote.length, cls: 'cm-comment', title: c.text })
  }
  return out
}

const names = (entries: Entry[]) => setNames.of({ matcher: buildMatcher(entries), entries: new Map(entries.map(e => [e.slug, e])) })

// A published chapter of a web novel is read-only until you unlock it.
const lockC = new Compartment()
const lockExt = (on: boolean) => EditorState.readOnly.of(on)

// No red lines while writing; Review turns on the Windows spellchecker.
const spelling = new Compartment()
const spellingExt = (on: boolean) => EditorView.contentAttributes.of({ spellcheck: on ? 'true' : 'false' })
/** Windows' own spellchecker: Review mode, and only if it is the chosen engine. */
const windowsSpell = () => { const p = useStore.getState().prefs; return p.mode === 'review' && p.spell === 'windows' }

/** LanguageTool on one scene's text, without the bible's names and the words you added to the dictionary. */
export async function checkWithLT(text: string) {
  const { book, prefs } = useStore.getState()
  if (!book) return []
  const dict = new Set((book.meta.dictionary ?? []).map(w => w.toLowerCase()))
  const all = await ltCheck(text, ltLanguage(book.meta.language, prefs.ltEnglish), { server: prefs.ltServer, user: prefs.ltUser, key: prefs.ltKey }, book.meta.ltIgnored ?? [])
  const names = findMentions(text, buildMatcher(book.entries, true))
  return all.filter(m => !(m.kind === 'spell' && (dict.has(text.slice(m.from, m.to).toLowerCase()) || names.some(n => n.from < m.to && n.to > m.from))))
}

/** Enter twice at the end of a scene starts a new scene; once more, a new chapter. */
function breakKey(sceneId: string) {
  return (view: EditorView) => {
    const st = useStore.getState()
    if (!st.prefs.enterBreaks || view.state.field(proposalField) || !view.state.selection.main.empty) return false
    const doc = view.state.doc.toString()
    if (st.freshSceneId === sceneId && doc === '') { st.promoteScene(sceneId); return true }
    if (enterStartsScene(doc, view.state.selection.main.head)) { st.splitScene(sceneId, doc.replace(/\s+$/, '')); return true }
    return false
  }
}

// A small bar above selected text: the most used actions, one click away.
const BAR: [string, (v: EditorView) => void][] = [
  ['Rewrite', () => runAction('rewrite', '', {})],
  ['Shorten', () => runAction('shorten', '', {})],
  ['Expand', () => runAction('expand', '', {})],
  ['Show it', () => runAction('show', '', {})],
  ['Comment', () => useStore.getState().setPrefs({ rightTab: 'notes', mode: 'write' })],
]
function selectionBar(state: EditorState): readonly Tooltip[] {
  const sel = state.selection.main
  if (sel.empty || sel.to - sel.from > 6000 || state.field(proposalField, false) || !useStore.getState().prefs.selBar) return []
  return [{
    pos: sel.from, above: true, arrow: false,
    create: view => {
      // CodeMirror styles the tooltip element itself; the bar goes inside it.
      const dom = document.createElement('div')
      const bar = dom.appendChild(document.createElement('div'))
      bar.className = 'pl-selbar'
      const add = (label: string, run: () => void, title?: string) => {
        const b = bar.appendChild(document.createElement('button'))
        b.type = 'button'
        b.textContent = label
        if (title) b.title = title
        // Keep the selection: act on mousedown, never take the focus.
        b.addEventListener('mousedown', e => { e.preventDefault(); view.focus(); run() })
      }
      for (const [label, run] of BAR) add(t(label), () => run(view))
      const text = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
      if (text.length <= 60) add(t('Synonyms'), () => useStore.setState({ dialog: 'synonyms' }))
      add('…', () => {
        const r = bar.getBoundingClientRect()
        showMenu({ clientX: r.right - 8, clientY: r.bottom + 4, preventDefault: () => {} }, editorMenu(view, view.state.selection.main.from))
      }, t('More'))
      return { dom }
    },
  }]
}
const selectionBarField = StateField.define<readonly Tooltip[]>({
  create: selectionBar,
  update: (v, tr) => (tr.docChanged || tr.selection || tr.effects.length ? selectionBar(tr.state) : v),
  provide: f => showTooltip.computeN([f], st => st.field(f)),
})

function makeState(s: Scene, lang: Lang, locked: boolean) {
  let tick: ReturnType<typeof setTimeout> | undefined
  return EditorState.create({
    doc: s.text,
    selection: { anchor: s.text.length }, // writers pick up where the scene stops
    extensions: [
      history(),
      lockC.of(lockExt(locked)),
      systemLinesExt,
      captureExt(s.id),
      commentColumnExt,
      edMarksExt({
        label: id => t(REPORTS.find(r => r.id === id)?.label ?? id),
        help: id => t(REPORTS.find(r => r.id === id)?.help ?? ''),
        ignoreHere: (m, hit) => { const st = useStore.getState(); st.updateMeta({ edIgnore: [...(st.book?.meta.edIgnore ?? []), { r: m.report, s: s.id, k: ignoreKey(hit, m.sentence) }] }) },
        ignoreWord: (m, hit) => { const st = useStore.getState(); st.updateMeta({ edIgnore: [...(st.book?.meta.edIgnore ?? []), { r: m.report, w: hit.trim().toLowerCase() }] }) },
        only: id => useReview.setState({ report: id }),
        hide: id => { const st = useStore.getState(); st.setPrefs({ edOff: [...new Set([...(st.prefs.edOff ?? []), id])] }); if (useReview.getState().report === id) useReview.setState({ report: null }) },
      }),
      spelling.of(spellingExt(windowsSpell())),
      languageToolExt({
        // Review mode, LanguageTool chosen, and this is the scene you are in.
        enabled: () => { const st = useStore.getState(); return (st.prefs.mode === 'review' ? st.prefs.edLT !== false : st.prefs.ltLive) && st.prefs.spell === 'languagetool' && st.sceneId === s.id },
        check: checkWithLT,
        addWord: w => { const st = useStore.getState(); st.updateMeta({ dictionary: [...(st.book?.meta.dictionary ?? []), w] }) },
        ignoreRule: r => { const st = useStore.getState(); st.updateMeta({ ltIgnored: [...(st.book?.meta.ltIgnored ?? []), r] }) },
      }),
      sceneExtensions(lang, {
        accept: () => accept(),
        escape: () => { if (useAI.getState().hasProposal) { discard(); return true } return false },
      }),
      draftExt,
      keymap.of([
        { key: 'Enter', run: breakKey(s.id) },
        { key: 'Mod-Enter', run: () => { runAction('continue', '', {}); return true } },
        // Cut the selection into the darlings drawer instead of deleting it.
        { key: 'Mod-Shift-d', run: v => cutToDarlings(v, s.id) },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      // The plan card's note, in grey, until the scene has text.
      placeholder(s.note?.trim() ? s.note.trim() : t('Start writing…')),
      marksExt,
      inlineExt,
      selectionBarField,
      // Marks the paragraph being written; only visible when "dim the rest" is on (styles.css).
      highlightActiveLine(),
      trackedChangesExt,
      unknown,
      placeholderExt((view, from, to, note) => fillPlaceholder(view, from, to, note)),
      EditorView.domEventHandlers({
        // Plume's own menu; in Review with the Windows spellchecker the system menu stays, for its suggestions.
        contextmenu: (e, view) => {
          if (useDraft.getState().on) return true
          if (windowsSpell()) return false
          const at = view.posAtCoords({ x: e.clientX, y: e.clientY })
          if (at === null) return false
          const sel = view.state.selection.main
          if (at < sel.from || at > sel.to) view.dispatch({ selection: { anchor: at } })
          showMenu(e, editorMenu(view, at))
          return true
        },
        focus: () => {
          // Clicking into a scene makes it the active one.
          if (useStore.getState().sceneId !== s.id) useStore.getState().selectScene(s.id)
          return false
        },
        keydown: e => {
          // Focus mode: the controls fade while you type, and come back when the mouse moves.
          if (useStore.getState().prefs.focus && e.key.length === 1 && !e.ctrlKey && !e.metaKey) document.body.classList.add('pl-typing')
          return false
        },
      }),
      EditorView.updateListener.of(u => {
        if (u.docChanged) {
          // Margin comments follow the text they were made on.
          const cur = findScene(useStore.getState().book, s.id)?.scene.comments
          const moved = cur?.some(c => c.at !== undefined && u.changes.mapPos(c.at) !== c.at)
          useStore.getState().updateScene(s.id, { text: u.state.doc.toString(), ...(moved ? { comments: cur!.map(c => c.at === undefined ? c : { ...c, at: u.changes.mapPos(c.at) }) } : {}) })
        }
        if (u.docChanged || u.selectionSet) {
          clearTimeout(tick)
          tick = setTimeout(() => useStore.getState().bumpEditor(), 250)
        }
        if (u.selectionSet) useStore.getState().noteSpot(s.id, u.state.selection.main.head)
        if (u.transactions.some(tr => tr.effects.length)) syncProposalState()
        // Typewriter scrolling: typing keeps the line in the middle of the screen.
        if ((u.docChanged || u.selectionSet) && u.view.hasFocus && (useStore.getState().prefs.typewriter || useDraft.getState().on) && !u.transactions.some(tr => tr.scrollIntoView)) {
          const head = u.state.selection.main.head
          requestAnimationFrame(() => { if (u.view.dom.isConnected) u.view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) }) })
        }
      }),
    ],
  })
}

export default function Editor({ scene }: { scene: Scene }) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [view, setView] = useState<EditorView | null>(null)
  const lang = useStore(s => s.book!.meta.language)
  const entries = useStore(s => s.book!.entries)
  const mode = useStore(s => s.prefs.mode)
  const active = useStore(s => s.sceneId === scene.id)
  const locked = useStore(s => { const f = findScene(s.book, scene.id); return !!f && isLocked(f.chapter, s.unlocked) })

  useEffect(() => {
    const view = new EditorView({ state: makeState(scene, lang, locked), parent: host.current! })
    viewRef.current = view
    setView(view)
    view.dispatch({ effects: names(useStore.getState().book!.entries) })
    // A proposal left waiting when this scene was closed comes back.
    const back = takeProposal(scene.id)
    if (back && back.to <= view.state.doc.length) view.dispatch({ effects: setProposal.of({ ...back, streaming: false }) })
    return () => {
      // Changes and a finished proposal still waiting for you are kept for when the scene opens again.
      const changes = view.state.field(changesField)
      if (changes.length) useEdit.setState(s => ({ pending: { ...s.pending, [scene.id]: [...changes.map(c => ({ ...c, was: view.state.doc.sliceString(c.from, c.to) })), ...(s.pending[scene.id] ?? [])] } }))
      const p = view.state.field(proposalField, false)
      if (p && !p.streaming) keepProposal(scene.id, p)
      if (getEditorView() === view) setEditorView(null)
      setView(null)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, lang])

  // The text changed elsewhere (a scene split, say): show it.
  useEffect(() => {
    const v = viewRef.current
    if (v && v.state.doc.toString() !== scene.text && !v.state.field(proposalField)) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: scene.text } })
    }
  }, [scene.text])

  useEffect(() => { viewRef.current?.dispatch({ effects: names(entries) }) }, [entries])
  useEffect(() => { viewRef.current?.dispatch({ effects: lockC.reconfigure(lockExt(locked)) }) }, [locked])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { viewRef.current?.dispatch({ effects: setHighlights.of({ key: 'comments', list: commentHighlights(viewRef.current.state.doc.toString(), scene.comments) }) }) }, [scene.comments])

  // Review: the chosen report's findings, recomputed a moment after the text changes.
  const report = useReview(s => (mode === 'review' ? s.report : null))
  const aiFound = useReview(s => s.ai)
  useEffect(() => {
    const timer = setTimeout(() => {
      const v = viewRef.current
      if (v) v.dispatch({ effects: setHighlights.of({ key: 'review', list: reviewHighlights(v.state.doc.toString(), report === 'ai' || report?.startsWith('word:') ? report : null, aiFound) }) })
    }, report ? 300 : 0)
    return () => clearTimeout(timer)
  }, [report, aiFound, scene.text])
  // Editing: every report's findings on this scene (minus the reports switched off and what you ignored), or one report alone.
  const edOff = useStore(s => s.prefs.edOff)
  const edIgnore = useStore(s => s.book!.meta.edIgnore)
  useEffect(() => {
    const timer = setTimeout(() => {
      const v = viewRef.current
      const book = useStore.getState().book
      if (!v || !book) return
      const on = mode === 'review' && report !== 'ai' && !report?.startsWith('word:')
      v.dispatch({ effects: setEdMarks.of(on ? sceneMarks(v.state.doc.toString(), book, scene.id, edOff ?? [], edIgnore ?? [], report) : []) })
    }, 300)
    return () => clearTimeout(timer)
  }, [mode, report, edOff, edIgnore, scene.text, scene.id])
  // Claude's editor: its findings on this scene stay in the text until they are fixed or cleared.
  const edFound = useEdit(s => s.findings)
  useEffect(() => {
    const v = viewRef.current
    if (!v) return
    const doc = v.state.doc.toString()
    const list = edFound.filter(f => f.sceneId === scene.id && f.quote).flatMap(f => { const at = doc.indexOf(f.quote); return at < 0 ? [] : [{ from: at, to: at + f.quote.length, cls: 'cm-review-ai', title: `${f.problem}${f.fix ? ` → ${f.fix}` : ''}` }] })
    v.dispatch({ effects: setHighlights.of({ key: 'edit', list }) })
  }, [edFound, scene.text, scene.id])
  const spell = useStore(s => s.prefs.spell)
  const ltLive = useStore(s => s.prefs.ltLive)
  const edLT = useStore(s => s.prefs.edLT)
  useEffect(() => { viewRef.current?.dispatch({ effects: [spelling.reconfigure(spellingExt(mode === 'review' && spell === 'windows')), refreshLT.of(null)] }) }, [mode, spell, ltLive, edLT])
  // Coming from Find: select the match once this scene is the open one.
  const jump = useStore(s => s.jump)
  useEffect(() => {
    const v = viewRef.current
    if (!v || !jump || jump.sceneId !== scene.id || !active) return
    const to = Math.min(jump.to, v.state.doc.length)
    v.dispatch({ selection: { anchor: Math.min(jump.from, to), head: to }, scrollIntoView: true })
    v.focus()
    useStore.setState({ jump: null })
  }, [jump, active, scene.id])
  // Another scene became the active one: LanguageTool moves with it.
  useEffect(() => { viewRef.current?.dispatch({ effects: refreshLT.of(null) }) }, [active])
  // Edit this chapter: Claude's fixes for this scene arrive as tracked changes.
  const fixes = useEdit(s => s.pending[scene.id])
  useEffect(() => {
    const v = viewRef.current
    if (!v || !fixes) return
    const list = takePending(scene.id)
    if (list) {
      // Changes kept while the scene was closed find their words again (they may have moved); those whose words are gone are dropped.
      const doc = v.state.doc.toString()
      const placed = list.flatMap(c => {
        if (c.was === undefined) return c.to <= doc.length ? [c] : []
        if (doc.slice(c.from, c.to) === c.was) return [c]
        const at = c.was ? locateQuote(doc, c.was, c.from) : -1
        return at < 0 ? [] : [{ ...c, from: at, to: at + c.was.length }]
      })
      // Changes still waiting for you stay; a new one on the same words waits for them to be settled.
      const have = v.state.field(changesField)
      const fresh: typeof placed = []
      for (const c of placed) if (![...have, ...fresh].some(h => c.from <= h.to && c.to >= h.from)) fresh.push(c)
      v.dispatch({ effects: setChanges.of([...have, ...fresh]) })
    }
  }, [fixes, scene.id])

  // Chosen in the tree, or just created: become the active editor, focused and in view.
  useEffect(() => {
    const v = viewRef.current
    if (!v || !active) return
    setEditorView(v)
    syncProposalState()
    useStore.getState().bumpEditor()
    if (!v.hasFocus) {
      v.focus()
      host.current?.scrollIntoView({ block: 'nearest' })
    }
    if (useDraft.getState().on) v.dispatch({ selection: { anchor: v.state.doc.length }, scrollIntoView: true })
  }, [active])

  return <>
    <div className="pl-editor" ref={host} />
    {view && !!scene.comments?.length && <CommentColumn view={view} scene={scene} />}
  </>
}
