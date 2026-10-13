// One scene's editor. A chapter shows one per scene; the scene you are in is
// the "active" one: the AI panel, Accept/Discard and the counters follow it.
import { useEffect, useRef } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { useStore } from '../store'
import { t } from '../i18n'
import type { Entry, Lang, Scene } from '../lib/types'
import { buildMatcher } from '../lib/context'
import { enterStartsScene } from '../lib/chapters'
import { proposalField, sceneExtensions, setNames } from './cm'
import { accept, discard, getEditorView, runAction, setEditorView, syncProposalState, useAI } from './actions'

const names = (entries: Entry[]) => setNames.of({ matcher: buildMatcher(entries), entries: new Map(entries.map(e => [e.slug, e])) })

// No red lines while writing; Review turns on the Windows spellchecker.
const spelling = new Compartment()
const spellingExt = (write: boolean) => EditorView.contentAttributes.of({ spellcheck: write ? 'false' : 'true' })

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

function makeState(s: Scene, lang: Lang) {
  let tick: ReturnType<typeof setTimeout> | undefined
  return EditorState.create({
    doc: s.text,
    selection: { anchor: s.text.length }, // writers pick up where the scene stops
    extensions: [
      history(),
      spelling.of(spellingExt(useStore.getState().prefs.mode === 'write')),
      sceneExtensions(lang, {
        accept: () => accept(),
        escape: () => { if (useAI.getState().hasProposal) { discard(); return true } return false },
      }),
      keymap.of([
        { key: 'Enter', run: breakKey(s.id) },
        { key: 'Mod-Enter', run: () => { runAction('continue', '', {}); return true } },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      placeholder(t('Start writing…')),
      EditorView.domEventHandlers({
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
        if (u.docChanged) useStore.getState().updateScene(s.id, { text: u.state.doc.toString() })
        if (u.docChanged || u.selectionSet) {
          clearTimeout(tick)
          tick = setTimeout(() => useStore.getState().bumpEditor(), 250)
        }
        if (u.transactions.some(tr => tr.effects.length)) syncProposalState()
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
  useEffect(() => { viewRef.current?.dispatch({ effects: spelling.reconfigure(spellingExt(mode === 'write')) }) }, [mode])

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
