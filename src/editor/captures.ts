// Capture lines in the scene editor: drawn apart while you type them, and taken out
// of the text on Enter (or when you leave the editor, so none reaches an export).
import { isolateHistory } from '@codemirror/commands'
import { Prec, RangeSetBuilder, type Text } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { captureKind, captureQuote, parseCapture, type Capture } from '../lib/captures'
import { fixTypography } from '../lib/typography'
import { newId } from '../lib/text'
import { addItem, showScratch } from '../scratch'
import { findScene, useStore } from '../store'
import { t } from '../i18n'
import { proposalField } from './cm'

const captureLine = Decoration.line({ class: 'cm-capture' })
const linesPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view) }
  build(view: EditorView) {
    const b = new RangeSetBuilder<Decoration>()
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos)
        if (captureKind(line.text)) b.add(line.from, line.from, captureLine)
        pos = line.to + 1
      }
    }
    return b.finish()
  }
}, { decorations: v => v.decorations })

/** Where the line's words go, once they have left the text. */
function route(c: Capture, sceneId: string, quoted: { quote: string; at: number } | null) {
  const st = useStore.getState()
  const text = fixTypography(c.text, st.book?.meta.language ?? 'fr')
  const open = { label: t('Open'), run: () => showScratch('inbox') }
  if (c.kind === 'comment' && quoted) {
    const scene = findScene(st.book, sceneId)?.scene
    if (scene) st.updateScene(sceneId, { comments: [...(scene.comments ?? []), { id: newId(), quote: quoted.quote, text, date: new Date().toISOString().slice(0, 10), at: quoted.at }] })
    st.notify('ok', t('Comment added in the margin.'))
  } else if (c.kind === 'todo') {
    addItem('task', text, { from: sceneId })
    st.notify('ok', t('Added to your tasks.'), { label: t('Open'), run: () => showScratch('tasks') })
  } else if (c.kind === 'bible') {
    addItem('note', text, { inbox: true, name: c.name, from: sceneId })
    st.notify('ok', t('In the inbox, for {name}.', { name: c.name ?? '' }), open)
  } else {
    addItem('note', text, { inbox: true, from: sceneId })
    st.notify('ok', t('In the inbox.'), open)
  }
}

/** What to delete for a line: its break too, unless it is the last one (the empty line stays, to go on writing). */
function lineRange(doc: Text, n: number) {
  const line = doc.line(n)
  return { from: line.from, to: n < doc.lines ? line.to + 1 : line.to }
}

function takeLines(view: EditorView, sceneId: string, numbers: number[]) {
  const doc = view.state.doc
  const text = doc.toString()
  const found = numbers.map(n => {
    const line = doc.line(n)
    return { capture: parseCapture(line.text)!, quoted: captureQuote(text, line.from), range: lineRange(doc, n) }
  })
  view.dispatch({ changes: found.map(f => f.range), annotations: isolateHistory.of('full'), scrollIntoView: view.hasFocus, userEvent: 'delete.capture' })
  for (const f of found) route(f.capture, sceneId, f.quoted)
}

const blocked = (view: EditorView) => view.state.readOnly || !!view.state.field(proposalField)

/** Enter on a capture line. */
const enter = (sceneId: string) => (view: EditorView) => {
  const sel = view.state.selection.main
  if (!sel.empty || blocked(view)) return false
  const line = view.state.doc.lineAt(sel.head)
  if (!parseCapture(line.text)) return false
  takeLines(view, sceneId, [line.number])
  return true
}

/** Leaving the editor (not the window: you may be looking something up): no capture line stays behind. */
function sweep(view: EditorView, sceneId: string) {
  if (!document.hasFocus() || blocked(view)) return
  const numbers: number[] = []
  view.state.doc.toString().split('\n').forEach((line, i) => { if (parseCapture(line)) numbers.push(i + 1) })
  if (numbers.length) takeLines(view, sceneId, numbers)
}

export const captureExt = (sceneId: string) => [
  linesPlugin,
  Prec.high(keymap.of([{ key: 'Enter', run: enter(sceneId) }])),
  EditorView.domEventHandlers({ blur: (_, view) => { sweep(view, sceneId); return false } }),
]
