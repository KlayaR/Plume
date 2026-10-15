// CodeMirror pieces for the scene editor: bible names underlined (with a hover
// card), typography as you type, and AI proposals shown inline until accepted.
import { isolateHistory } from '@codemirror/commands'
import { Annotation, EditorState, Prec, RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, hoverTooltip, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import type { Entry, Lang } from '../lib/types'
import { findMentions, type Matcher } from '../lib/context'
import { autoCapitalRule, fixTypography, loneI, typingRule } from '../lib/typography'
import { pasteText } from '../lib/paste'
import { useStore } from '../store'
import { t } from '../i18n'

// --- Bible names -----------------------------------------------------------

interface Names { matcher: Matcher; entries: Map<string, Entry> }
export const setNames = StateEffect.define<Names>()
const namesField = StateField.define<Names>({
  create: () => ({ matcher: { re: null, aliases: [] }, entries: new Map() }),
  update: (v, tr) => tr.effects.reduce((acc, e) => (e.is(setNames) ? e.value : acc), v),
})

const mentionMark = Decoration.mark({ class: 'cm-mention' })

const mentionsPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(u: ViewUpdate) {
    if (u.docChanged || u.viewportChanged || u.transactions.some(t => t.effects.some(e => e.is(setNames)))) {
      this.decorations = this.build(u.view)
    }
  }
  build(view: EditorView) {
    const { matcher } = view.state.field(namesField)
    const b = new RangeSetBuilder<Decoration>()
    let last = 0
    for (const { from, to } of view.visibleRanges) {
      const lf = view.state.doc.lineAt(from).from
      const lt = view.state.doc.lineAt(to).to
      for (const m of findMentions(view.state.doc.sliceString(lf, lt), matcher)) {
        if (lf + m.from < last) continue
        b.add(lf + m.from, lf + m.to, mentionMark)
        last = lf + m.to
      }
    }
    return b.finish()
  }
}, { decorations: v => v.decorations })

const nameCard = hoverTooltip((view, pos) => {
  const { matcher, entries } = view.state.field(namesField)
  const line = view.state.doc.lineAt(pos)
  const hit = findMentions(line.text, matcher).find(m => line.from + m.from <= pos && pos <= line.from + m.to)
  const e = hit && entries.get(hit.slug)
  if (!hit || !e) return null
  return {
    pos: line.from + hit.from,
    end: line.from + hit.to,
    above: true,
    create: () => {
      const dom = document.createElement('div')
      dom.className = 'cm-namecard'
      const name = dom.appendChild(document.createElement('div'))
      name.className = 'cm-namecard-name'
      name.textContent = e.name
      const body = dom.appendChild(document.createElement('div'))
      body.className = 'cm-namecard-body'
      body.textContent = e.short.trim() || t('No short version yet.')
      return { dom }
    },
  }
}, { hoverTime: 350 })

// --- Drop cap -----------------------------------------------------------
// The first letter of the text, alone (an apostrophe or quote after it stays
// normal size). Styled only on a chapter's first scene, by the sheet's CSS.
// When the opening paragraph is a single line, the next paragraph wraps beside
// the letter, as in print, without its indent (measured, see dropcapMeasure).
const dropcapMark = Decoration.mark({ class: 'cm-dropcap' })
const afterDropDeco = Decoration.line({ class: 'cm-afterdrop' })
const setShortOpening = StateEffect.define<boolean>()
interface Drop { short: boolean; deco: DecorationSet }
const dropcapField = StateField.define<Drop>({
  create: s => ({ short: false, deco: dropcap(s, false) }),
  update: (d, tr) => {
    const short = tr.effects.reduce((acc, e) => (e.is(setShortOpening) ? e.value : acc), d.short)
    return tr.docChanged || short !== d.short ? { short, deco: dropcap(tr.state, short) } : d
  },
  provide: f => EditorView.decorations.from(f, d => d.deco),
})
function dropcap(state: EditorState, short: boolean): DecorationSet {
  const first = state.doc.line(1).text
  const i = first.search(/\p{L}/u)
  if (i < 0 || first.slice(0, i).trim()) return Decoration.none // text must start with the letter
  const next = state.doc.lines > 1 ? state.doc.line(2) : null
  return Decoration.set([
    dropcapMark.range(i, i + 1),
    ...(short && next && next.text.trim() ? [afterDropDeco.range(next.from)] : []),
  ])
}
/** Is the letter taller than its paragraph? Checked after each layout change. */
const dropcapMeasure = ViewPlugin.fromClass(class {
  constructor(view: EditorView) { this.measure(view) }
  update(u: ViewUpdate) { if (u.docChanged || u.geometryChanged) this.measure(u.view) }
  measure(view: EditorView) {
    view.requestMeasure({
      read: v => {
        const letter = v.contentDOM.querySelector('.cm-dropcap')
        const line = letter?.closest('.cm-line')
        if (!letter || !line) return false
        return letter.getBoundingClientRect().bottom > line.getBoundingClientRect().bottom + 2
      },
      write: (short, v) => {
        if (short !== v.state.field(dropcapField).short) setTimeout(() => v.dispatch({ effects: setShortOpening.of(short) }))
      },
    })
  }
})

// --- Typography as you type -----------------------------------------------

/** The last autocorrect (smart quote, ellipsis, dash, capital), so Ctrl+Z can give back exactly what was typed. */
interface Auto { start: number; insert: string; original: string }
const setAuto = StateEffect.define<Auto | null>()
const autoField = StateField.define<Auto | null>({
  create: () => null,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setAuto)) return e.value
    return tr.docChanged || tr.selection ? null : v
  },
})

const autoUndo = (view: EditorView): boolean => {
  const a = view.state.field(autoField)
  if (!a || view.state.selection.main.head !== a.start + a.insert.length || view.state.sliceDoc(a.start, a.start + a.insert.length) !== a.insert) return false
  view.dispatch({ changes: { from: a.start, to: a.start + a.insert.length, insert: a.original }, selection: { anchor: a.start + a.original.length }, effects: setAuto.of(null), userEvent: 'input.type' })
  return true
}

const typography = (lang: Lang): Extension => [
  autoField,
  Prec.high(keymap.of([{ key: 'Mod-z', run: autoUndo }])),
  EditorView.inputHandler.of((view, from, to, text) => {
    if (text.length !== 1 || view.state.field(proposalField)) return false
    const line = view.state.doc.lineAt(from)
    const before = view.state.doc.sliceString(line.from, from)
    const capital = useStore.getState().prefs.autoCapital
    let rule = typingRule(lang, before, text) ?? (capital ? autoCapitalRule(lang, before, text) : null)
    if (capital && (!rule || rule.remove === 0) && loneI(lang, before, text)) rule = { remove: 1, insert: 'I' + (rule ? rule.insert : text) }
    if (!rule) return false
    const start = from - rule.remove
    const original = view.state.doc.sliceString(start, to) + text
    view.dispatch({ changes: { from: start, to, insert: rule.insert }, selection: { anchor: start + rule.insert.length }, effects: setAuto.of({ start, insert: rule.insert, original }), userEvent: 'input.type' })
    return true
  }),
  // Pasted text arrives clean: no formatting but italics and bold, one paragraph per line, typography fixed.
  EditorView.domEventHandlers({
    paste(e, view) {
      if (view.state.field(proposalField)) return false
      const html = e.clipboardData?.getData('text/html') ?? ''
      const plain = e.clipboardData?.getData('text/plain') ?? ''
      const sel = view.state.selection.main
      const line = view.state.doc.lineAt(sel.from)
      const text = pasteText(html, plain, lang, view.state.doc.sliceString(line.from, sel.from))
      if (!text) return false
      e.preventDefault()
      view.dispatch({ ...view.state.replaceSelection(text), scrollIntoView: true, userEvent: 'input.paste' })
      return true
    },
  }),
]

// --- AI proposals -----------------------------------------------------------

export interface Proposal { from: number; to: number; text: string; streaming: boolean }
export const setProposal = StateEffect.define<Proposal | null>()
export const appendProposal = StateEffect.define<string>()
export const endStream = StateEffect.define<null>()
const accepting = Annotation.define<boolean>()

class ProposalWidget extends WidgetType {
  constructor(readonly text: string, readonly streaming: boolean) { super() }
  eq(o: ProposalWidget) { return o.text === this.text && o.streaming === this.streaming }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-proposal' + (this.streaming ? ' cm-proposal-streaming' : '')
    span.textContent = this.text || (this.streaming ? ' ' : '')
    return span
  }
  ignoreEvent() { return false }
}

export const proposalField = StateField.define<Proposal | null>({
  create: () => null,
  update(p, tr) {
    for (const e of tr.effects) {
      if (e.is(setProposal)) p = e.value
      else if (e.is(appendProposal) && p) p = { ...p, text: p.text + e.value }
      else if (e.is(endStream) && p) p = { ...p, streaming: false }
    }
    return p
  },
  provide: f => EditorView.decorations.from(f, p => {
    if (!p) return Decoration.none
    const ranges = []
    if (p.to > p.from) ranges.push(Decoration.mark({ class: 'cm-proposal-old' }).range(p.from, p.to))
    ranges.push(Decoration.widget({ widget: new ProposalWidget(p.text, p.streaming), side: 1 }).range(p.to))
    return Decoration.set(ranges, true)
  }),
})

/** While a proposal is shown, the text is locked: accept or discard it first. */
const lockWhileProposing = EditorState.transactionFilter.of(tr => {
  if (tr.docChanged && tr.startState.field(proposalField) && !tr.annotation(accepting)) return []
  return tr
})

/** Text just accepted from Claude, softly highlighted for a few seconds. */
const setAccepted = StateEffect.define<{ from: number; to: number } | null>()
const acceptedField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) if (e.is(setAccepted)) deco = e.value && e.value.to > e.value.from ? Decoration.set([Decoration.mark({ class: 'cm-accepted' }).range(e.value.from, e.value.to)]) : Decoration.none
    return deco
  },
  provide: f => EditorView.decorations.from(f),
})

export function acceptProposal(view: EditorView, lang: Lang): boolean {
  const p = view.state.field(proposalField)
  if (!p || p.streaming || !p.text.trim()) return false
  let text = fixTypography(p.text.replace(/\s+$/, ''), lang)
  if (p.from === p.to) {
    const prev = view.state.doc.sliceString(Math.max(0, p.from - 1), p.from)
    if (prev && !/\s/.test(prev) && !/^\s/.test(text)) text = ' ' + text
  } else {
    text = text.replace(/^\s+/, '')
  }
  view.dispatch({
    changes: { from: p.from, to: p.to, insert: text },
    effects: [setProposal.of(null), setAccepted.of({ from: p.from, to: p.from + text.length })],
    // Its own undo step: one Ctrl+Z takes the whole proposal back.
    annotations: [accepting.of(true), isolateHistory.of('full')],
    selection: { anchor: p.from + text.length },
    scrollIntoView: true,
    userEvent: 'input.ai',
  })
  view.focus()
  setTimeout(() => { if (view.dom.isConnected) view.dispatch({ effects: setAccepted.of(null) }) }, 4000)
  return true
}

export function discardProposal(view: EditorView) {
  if (view.state.field(proposalField)) view.dispatch({ effects: setProposal.of(null) })
}

// --- Assembled ------------------------------------------------------------

export function sceneExtensions(lang: Lang, keys: { accept: () => boolean; escape: () => boolean }): Extension[] {
  return [
    namesField,
    dropcapField,
    dropcapMeasure,
    mentionsPlugin,
    nameCard,
    proposalField,
    acceptedField,
    lockWhileProposing,
    typography(lang),
    keymap.of([
      { key: 'Tab', run: () => keys.accept() },
      { key: 'Escape', run: () => keys.escape() },
    ]),
    EditorView.lineWrapping,
    // The book's language, so Windows checks spelling (in Review) with the right dictionary.
    EditorView.contentAttributes.of({ lang }),
  ]
}
