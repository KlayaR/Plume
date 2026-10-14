// Marks laid over a scene's text, none of them stored in it except placeholders:
// unknown names (capitalised words not in the bible), placeholders ⟦…⟧ to fill
// later, margin-comment highlights, Review findings, and tracked changes
// (AI edits shown as suggestions to accept or reject one by one).
import { RangeSetBuilder, StateEffect, StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, hoverTooltip, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import type { EntryType } from '../lib/types'
import { findMentions, type Matcher } from '../lib/context'
import { foldText } from '../lib/text'
import { inlineSpans } from '../lib/inline'
import { t } from '../i18n'

// --- Unknown names ------------------------------------------------------------

/** Capitalised words that are never names. */
const NOT_NAMES = new Set(foldText('Dieu Seigneur Monsieur Madame Mademoiselle Messieurs Mesdames Sire Majesté Altesse Excellence Maître Père Mère Docteur Capitaine Mr Mrs Ms Miss Dr Sir Lady Lord God OK Okay Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Christmas Noël Pâques').split(' '))

export const refreshMarks = StateEffect.define<null>()

export interface UnknownOptions {
  matcher: () => Matcher
  ignored: () => string[]
  add: (name: string, type: EntryType) => void
  ignore: (name: string) => void
}

const unknownMark = Decoration.mark({ class: 'cm-unknown' })
const CAP = /(?<![\p{L}\p{N}’'-])\p{Lu}[\p{Ll}’'-]+(?:[ -]\p{Lu}[\p{Ll}’'-]+)*/gu

/** Names in a line that the bible doesn't know: not at a sentence start, not a known word. */
export function unknownNames(line: string, matcher: Matcher, ignored: Set<string>): { from: number; to: number; name: string }[] {
  const known = findMentions(line, matcher)
  const out: { from: number; to: number; name: string }[] = []
  for (const m of line.matchAll(CAP)) {
    const from = m.index!
    const name = m[0].replace(/[’'-]+$/, '')
    const to = from + name.length
    const before = line.slice(0, from).replace(/[\s«“"(—–-]+$/u, '')
    if (!before || /[.!?…:]["»”’)]*$/u.test(before)) continue // sentence start
    if (known.some(k => k.from < to && k.to > from)) continue
    const f = foldText(name)
    if (NOT_NAMES.has(f) || ignored.has(f) || name.length < 2) continue
    out.push({ from, to, name })
  }
  return out
}

function unknownPlugin(o: UnknownOptions) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet
    found: { from: number; to: number; name: string }[] = []
    constructor(view: EditorView) { this.decorations = this.build(view) }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.transactions.some(tr => tr.effects.length)) this.decorations = this.build(u.view)
    }
    build(view: EditorView) {
      const b = new RangeSetBuilder<Decoration>()
      const ignored = new Set(o.ignored().map(foldText))
      const matcher = o.matcher()
      this.found = []
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = view.state.doc.lineAt(pos)
          for (const u of unknownNames(line.text, matcher, ignored)) {
            b.add(line.from + u.from, line.from + u.to, unknownMark)
            this.found.push({ from: line.from + u.from, to: line.from + u.to, name: u.name })
          }
          pos = line.to + 1
        }
      }
      return b.finish()
    }
  }, { decorations: v => v.decorations })
}

function unknownCard(o: UnknownOptions, plugin: ReturnType<typeof unknownPlugin>) {
  return hoverTooltip((view, pos) => {
    const hit = view.plugin(plugin)?.found.find(f => f.from <= pos && pos <= f.to)
    if (!hit) return null
    return {
      pos: hit.from, end: hit.to, above: true,
      create: () => {
        const dom = document.createElement('div')
        dom.className = 'cm-namecard cm-unknowncard'
        const title = dom.appendChild(document.createElement('div'))
        title.className = 'cm-namecard-name'
        title.textContent = t('“{name}” isn’t in the bible', { name: hit.name })
        const row = dom.appendChild(document.createElement('div'))
        row.className = 'cm-card-row'
        const btn = (label: string, run: () => void) => {
          const b = row.appendChild(document.createElement('button'))
          b.className = 'sk-btn sk-btn-sm'
          b.textContent = label
          b.onmousedown = e => { e.preventDefault(); run(); view.dispatch({ effects: refreshMarks.of(null) }) }
        }
        btn(t('Character'), () => o.add(hit.name, 'character'))
        btn(t('Place'), () => o.add(hit.name, 'place'))
        btn(t('Object'), () => o.add(hit.name, 'object'))
        btn(t('Other'), () => o.add(hit.name, 'lore'))
        btn(t('Not a name'), () => o.ignore(hit.name))
        return { dom }
      },
    }
  }, { hoverTime: 300 })
}

export function unknownNamesExt(o: UnknownOptions) {
  const plugin = unknownPlugin(o)
  return [plugin, unknownCard(o, plugin)]
}

// --- Placeholders ⟦note⟧ ------------------------------------------------------

export const PLACEHOLDER = /⟦([^⟧\n]*)⟧/g
const placeholderMark = Decoration.mark({ class: 'cm-placeholder-mark' })

const placeholders = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view) }
  build(view: EditorView) {
    const b = new RangeSetBuilder<Decoration>()
    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to)
      for (const m of text.matchAll(PLACEHOLDER)) b.add(from + m.index!, from + m.index! + m[0].length, placeholderMark)
    }
    return b.finish()
  }
}, { decorations: v => v.decorations })

/** Ctrl+Shift+X drops a placeholder at the cursor (or around the selection) and puts the cursor inside. */
export const insertPlaceholder = (view: EditorView) => {
  const { from, to } = view.state.selection.main
  const inner = view.state.doc.sliceString(from, to)
  view.dispatch({ changes: { from, to, insert: `⟦${inner}⟧` }, selection: { anchor: from + 1, head: from + 1 + inner.length } })
  return true
}

export function placeholderExt(fill: (view: EditorView, from: number, to: number, note: string) => void) {
  const card = hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos)
    for (const m of line.text.matchAll(PLACEHOLDER)) {
      const from = line.from + m.index!, to = from + m[0].length
      if (pos < from || pos > to) continue
      return {
        pos: from, end: to, above: true,
        create: () => {
          const dom = document.createElement('div')
          dom.className = 'cm-namecard'
          const title = dom.appendChild(document.createElement('div'))
          title.className = 'cm-namecard-name'
          title.textContent = t('Placeholder')
          const body = dom.appendChild(document.createElement('div'))
          body.className = 'cm-namecard-body'
          body.textContent = m[1].trim() || t('No note.')
          const b = dom.appendChild(document.createElement('button'))
          b.className = 'sk-btn sk-btn-sm sk-btn-primary cm-card-btn'
          b.textContent = t('Fill with AI')
          b.onmousedown = e => { e.preventDefault(); fill(view, from, to, m[1]) }
          return { dom }
        },
      }
    }
    return null
  }, { hoverTime: 300 })
  return [placeholders, card, keymap.of([{ key: 'Mod-Shift-x', run: insertPlaceholder }])]
}

/** Open placeholders in a text (for the red dots in the chapter tree). */
export const countPlaceholders = (text: string) => (text.match(PLACEHOLDER) ?? []).length

// --- Highlights: comments and Review findings ---------------------------------

export interface Highlight { from: number; to: number; cls: string; title?: string }
export const setHighlights = StateEffect.define<{ key: string; list: Highlight[] }>()

/** Groups of highlights by key ("comments", "review"), redrawn when set again. */
const highlightField = StateField.define<Record<string, Highlight[]>>({
  create: () => ({}),
  update: (v, tr) => {
    let out = v
    if (tr.docChanged) out = Object.fromEntries(Object.entries(out).map(([k, l]) => [k, l.map(h => ({ ...h, from: tr.changes.mapPos(h.from, 1), to: tr.changes.mapPos(h.to, -1) })).filter(h => h.to > h.from)]))
    for (const e of tr.effects) if (e.is(setHighlights)) out = { ...out, [e.value.key]: e.value.list }
    return out
  },
  provide: f => EditorView.decorations.from(f, groups => {
    const all = Object.values(groups).flat().filter(h => h.to > h.from).sort((a, b) => a.from - b.from || a.to - b.to)
    const b = new RangeSetBuilder<Decoration>()
    for (const h of all) b.add(h.from, h.to, Decoration.mark({ class: h.cls, attributes: h.title ? { title: h.title } : undefined }))
    return b.finish()
  }),
})

export const marksExt = [highlightField]

// --- Tracked changes ------------------------------------------------------------

export interface Change { id: string; from: number; to: number; insert: string; why: string }
export const setChanges = StateEffect.define<Change[]>()

class InsertWidget extends WidgetType {
  constructor(readonly c: Change) { super() }
  eq(o: InsertWidget) { return o.c.id === this.c.id && o.c.insert === this.c.insert }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-change'
    span.title = this.c.why
    const ins = span.appendChild(document.createElement('ins'))
    ins.textContent = this.c.insert
    for (const [cls, label, title] of [['cm-change-yes', '✓', t('Accept')], ['cm-change-no', '✕', t('Reject')]]) {
      const b = span.appendChild(document.createElement('button'))
      b.className = `cm-change-btn ${cls}`
      b.textContent = label
      b.title = title
      b.dataset.change = this.c.id
    }
    return span
  }
  ignoreEvent() { return false }
}

export const changesField = StateField.define<Change[]>({
  create: () => [],
  update: (v, tr) => {
    let out = tr.docChanged ? v.map(c => ({ ...c, from: tr.changes.mapPos(c.from, 1), to: tr.changes.mapPos(c.to, -1) })).filter(c => c.to >= c.from) : v
    for (const e of tr.effects) if (e.is(setChanges)) out = e.value
    return out
  },
})

/** Applies or drops one change. */
export function resolveChange(view: EditorView, id: string, ok: boolean) {
  const list = view.state.field(changesField)
  const c = list.find(x => x.id === id)
  if (!c) return
  view.dispatch({
    changes: ok ? { from: c.from, to: c.to, insert: c.insert } : undefined,
    effects: setChanges.of(list.filter(x => x.id !== id)),
    userEvent: ok ? 'input.review' : undefined,
  })
}

export const trackedChangesExt = [
  changesField,
  EditorView.decorations.compute([changesField], (state: EditorState) => {
    const b = new RangeSetBuilder<Decoration>()
    for (const c of [...state.field(changesField)].sort((x, y) => x.from - y.from)) {
      if (c.to > c.from) b.add(c.from, c.to, Decoration.mark({ class: 'cm-change-del', attributes: { title: c.why } }))
      b.add(c.to, c.to, Decoration.widget({ widget: new InsertWidget(c), side: 1 }))
    }
    return b.finish()
  }),
  EditorView.domEventHandlers({
    mousedown: (e, view) => {
      const btn = (e.target as HTMLElement).closest('.cm-change-btn') as HTMLElement | null
      if (!btn?.dataset.change) return false
      e.preventDefault()
      resolveChange(view, btn.dataset.change, btn.classList.contains('cm-change-yes'))
      return true
    },
  }),
]

// --- Italics and bold ---------------------------------------------------------------

const cls = (i: boolean, b: boolean) => [i ? 'cm-it' : '', b ? 'cm-bd' : ''].filter(Boolean).join(' ')
const mdMark = Decoration.mark({ class: 'cm-md-mark' })

const inlinePlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view) }
  build(view: EditorView) {
    const b = new RangeSetBuilder<Decoration>()
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos)
        for (const s of inlineSpans(line.text)) {
          const a = line.from + s.from, z = line.from + s.to
          b.add(a, a + s.marker, mdMark)
          b.add(a + s.marker, z - s.marker, Decoration.mark({ class: cls(s.i, s.b) }))
          b.add(z - s.marker, z, mdMark)
        }
        pos = line.to + 1
      }
    }
    return b.finish()
  }
}, { decorations: v => v.decorations })

/** Wraps the selection in the marker, or takes it off if it is already wrapped. */
export function toggleInline(view: EditorView, mark: string): boolean {
  const { from, to } = view.state.selection.main
  const doc = view.state.doc
  const n = mark.length
  const before = doc.sliceString(Math.max(0, from - n), from)
  const after = doc.sliceString(to, Math.min(doc.length, to + n))
  if (from !== to && before === mark && after === mark) {
    view.dispatch({ changes: [{ from: from - n, to: from }, { from: to, to: to + n }], selection: { anchor: from - n, head: to - n } })
  } else {
    view.dispatch({ changes: [{ from, insert: mark }, { from: to, insert: mark }], selection: { anchor: from + n, head: to + n } })
  }
  return true
}

export const inlineExt = [
  inlinePlugin,
  keymap.of([
    { key: 'Mod-i', run: v => toggleInline(v, '*') },
    { key: 'Mod-b', run: v => toggleInline(v, '**') },
  ]),
]
