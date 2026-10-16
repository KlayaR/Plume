// One scene's editor. A chapter shows one per scene; the scene you are in is
// the "active" one: the AI panel, Accept/Discard and the counters follow it.
import { useEffect, useRef } from 'react'
import { Compartment, EditorState, StateField } from '@codemirror/state'
import { EditorView, highlightActiveLine, keymap, placeholder, showTooltip, type Tooltip } from '@codemirror/view'
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
import { proposalField, sceneExtensions, setNames } from './cm'
import { accept, discard, fillPlaceholder, getEditorView, runAction, setEditorView, syncProposalState, useAI } from './actions'
import { changesField, inlineExt, marksExt, placeholderExt, setChanges, setHighlights, trackedChangesExt, unknownNamesExt, type Highlight } from './marks'
import { takePending, useEdit } from '../edit'
import type { Comment, EntryType } from '../lib/types'
import { cutToDarlings } from '../writing'
import { useReview } from '../review'
import { occurrences, REPORTS } from '../lib/review'

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
  return def ? def.find(text, book.meta.language, book).map(f => ({ from: f.from, to: f.to, cls: `cm-review cm-review-${def.category}`, title: f.note })) : []
}

// The bible matcher for unknown-name detection, rebuilt only when the entries change.
let matcherCache: { entries: Entry[] | null; matcher: ReturnType<typeof buildMatcher> } = { entries: null, matcher: buildMatcher([]) }
const currentMatcher = () => {
  const entries = useStore.getState().book?.entries ?? []
  if (matcherCache.entries !== entries) matcherCache = { entries, matcher: buildMatcher(entries) }
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
  const names = findMentions(text, buildMatcher(book.entries))
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

function makeState(s: Scene, lang: Lang) {
  let tick: ReturnType<typeof setTimeout> | undefined
  return EditorState.create({
    doc: s.text,
    selection: { anchor: s.text.length }, // writers pick up where the scene stops
    extensions: [
      history(),
      spelling.of(spellingExt(windowsSpell())),
      languageToolExt({
        // Review mode, LanguageTool chosen, and this is the scene you are in.
        enabled: () => { const st = useStore.getState(); return (st.prefs.mode === 'review' || st.prefs.ltLive) && st.prefs.spell === 'languagetool' && st.sceneId === s.id },
        check: checkWithLT,
        addWord: w => { const st = useStore.getState(); st.updateMeta({ dictionary: [...(st.book?.meta.dictionary ?? []), w] }) },
        ignoreRule: r => { const st = useStore.getState(); st.updateMeta({ ltIgnored: [...(st.book?.meta.ltIgnored ?? []), r] }) },
      }),
      sceneExtensions(lang, {
        accept: () => accept(),
        escape: () => { if (useAI.getState().hasProposal) { discard(); return true } return false },
      }),
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
        if ((u.docChanged || u.selectionSet) && u.view.hasFocus && useStore.getState().prefs.typewriter && !u.transactions.some(tr => tr.scrollIntoView)) {
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
  const lang = useStore(s => s.book!.meta.language)
  const entries = useStore(s => s.book!.entries)
  const mode = useStore(s => s.prefs.mode)
  const active = useStore(s => s.sceneId === scene.id)

  useEffect(() => {
    const view = new EditorView({ state: makeState(scene, lang), parent: host.current! })
    viewRef.current = view
    view.dispatch({ effects: names(useStore.getState().book!.entries) })
    return () => {
      if (getEditorView() === view) setEditorView(null)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { viewRef.current?.dispatch({ effects: setHighlights.of({ key: 'comments', list: commentHighlights(viewRef.current.state.doc.toString(), scene.comments) }) }) }, [scene.comments])

  // Review: the chosen report's findings, recomputed a moment after the text changes.
  const report = useReview(s => (mode === 'review' ? s.report : null))
  const aiFound = useReview(s => s.ai)
  useEffect(() => {
    const timer = setTimeout(() => {
      const v = viewRef.current
      if (v) v.dispatch({ effects: setHighlights.of({ key: 'review', list: reviewHighlights(v.state.doc.toString(), report, aiFound) }) })
    }, report ? 300 : 0)
    return () => clearTimeout(timer)
  }, [report, aiFound, scene.text])
  const spell = useStore(s => s.prefs.spell)
  const ltLive = useStore(s => s.prefs.ltLive)
  useEffect(() => { viewRef.current?.dispatch({ effects: [spelling.reconfigure(spellingExt(mode === 'review' && spell === 'windows')), refreshLT.of(null)] }) }, [mode, spell, ltLive])
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
    if (list) v.dispatch({ effects: setChanges.of([...v.state.field(changesField), ...list.filter(c => c.to <= v.state.doc.length)]) })
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
  }, [active])

  return <div className="pl-editor" ref={host} />
}
