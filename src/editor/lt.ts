// LanguageTool in the text: the active scene is checked a moment after you stop
// typing (in Review mode only, when LanguageTool is the chosen engine). Issues
// are underlined: red for spelling, blue for grammar, yellow for style. Hover
// one for the explanation and one-click fixes.
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, hoverTooltip, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { create } from 'zustand'
import type { LTMatch } from '../lib/languagetool'
import { t } from '../i18n'

export interface LTOptions {
  /** Should this editor be checked now (Review mode, LanguageTool chosen, this scene active)? */
  enabled: () => boolean
  check: (text: string) => Promise<LTMatch[]>
  addWord: (word: string) => void
  ignoreRule: (rule: string) => void
}

interface Status { state: 'off' | 'idle' | 'checking' | 'error'; count: number; spell: number; grammar: number; error: string }
export const useLT = create<Status>(() => ({ state: 'off', count: 0, spell: 0, grammar: 0, error: '' }))

const setMatches = StateEffect.define<LTMatch[]>()
/** Asks for a new check now (the mode, the engine or the active scene changed). */
export const refreshLT = StateEffect.define<null>()

const KIND_CLASS = { spell: 'cm-lt cm-lt-spell', grammar: 'cm-lt cm-lt-grammar', style: 'cm-lt cm-lt-style' }

const ltField = StateField.define<LTMatch[]>({
  create: () => [],
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setMatches)) return e.value
    // While you type, the underlines follow the words they were found on.
    return tr.docChanged ? v.map(m => ({ ...m, from: tr.changes.mapPos(m.from, 1), to: tr.changes.mapPos(m.to, -1) })).filter(m => m.to > m.from) : v
  },
  provide: f => EditorView.decorations.from(f, list => {
    const b = new RangeSetBuilder<Decoration>()
    for (const m of [...list].sort((a, c) => a.from - c.from || a.to - c.to)) b.add(m.from, m.to, Decoration.mark({ class: KIND_CLASS[m.kind] }))
    return b.finish() as DecorationSet
  }),
})

const summary = (list: LTMatch[]) => ({ count: list.length, spell: list.filter(m => m.kind === 'spell').length, grammar: list.filter(m => m.kind === 'grammar').length })

function plugin(o: LTOptions) {
  return ViewPlugin.fromClass(class {
    timer: ReturnType<typeof setTimeout> | undefined
    seq = 0
    constructor(view: EditorView) { this.schedule(view) }
    update(u: ViewUpdate) {
      if (u.docChanged || u.transactions.some(tr => tr.effects.some(e => e.is(refreshLT)))) this.schedule(u.view)
    }
    destroy() { clearTimeout(this.timer); this.seq++ }
    schedule(view: EditorView) {
      clearTimeout(this.timer)
      if (!o.enabled()) {
        // Off: take the underlines away (not from inside an update).
        if (view.state.field(ltField).length) setTimeout(() => { if (view.dom.isConnected) view.dispatch({ effects: setMatches.of([]) }) }, 0)
        return
      }
      this.timer = setTimeout(() => this.run(view), 1500)
    }
    async run(view: EditorView) {
      if (!view.dom.isConnected || !o.enabled()) return
      const text = view.state.doc.toString()
      if (!text.trim()) { view.dispatch({ effects: setMatches.of([]) }); useLT.setState({ state: 'idle', count: 0, spell: 0, grammar: 0, error: '' }); return }
      const id = ++this.seq
      useLT.setState({ state: 'checking', error: '' })
      try {
        const matches = await o.check(text)
        if (id !== this.seq || !view.dom.isConnected) return
        // Typed on meanwhile: this answer is for older text, another check is coming.
        if (view.state.doc.toString() !== text) return
        view.dispatch({ effects: setMatches.of(matches) })
        useLT.setState({ state: 'idle', error: '', ...summary(matches) })
      } catch (e) {
        if (id === this.seq) useLT.setState({ state: 'error', error: (e as Error).message })
      }
    }
  })
}

function card(o: LTOptions) {
  return hoverTooltip((view, pos) => {
    const m = view.state.field(ltField).find(x => x.from <= pos && pos <= x.to)
    if (!m) return null
    return {
      pos: m.from, end: m.to, above: true,
      create: () => {
        const dom = document.createElement('div')
        dom.className = 'cm-namecard cm-ltcard'
        const title = dom.appendChild(document.createElement('div'))
        title.className = 'cm-namecard-name'
        title.textContent = m.short || m.category || t('Suggestion')
        const body = dom.appendChild(document.createElement('div'))
        body.className = 'cm-namecard-body'
        body.textContent = m.message
        const row = dom.appendChild(document.createElement('div'))
        row.className = 'cm-card-row'
        const remove = () => view.dispatch({ effects: setMatches.of(view.state.field(ltField).filter(x => x !== m)) })
        const btn = (label: string, cls: string, run: () => void) => {
          const b = row.appendChild(document.createElement('button'))
          b.className = `sk-btn sk-btn-sm ${cls}`
          b.textContent = label
          b.onmousedown = e => { e.preventDefault(); run() }
        }
        for (const r of m.replacements) btn(r || t('(delete)'), 'sk-btn-primary', () => view.dispatch({ changes: { from: m.from, to: m.to, insert: r }, userEvent: 'input.lt' }))
        if (m.kind === 'spell') btn(t('Add to dictionary'), '', () => { o.addWord(view.state.doc.sliceString(m.from, m.to)); remove() })
        btn(t('Ignore this rule'), 'sk-btn-ghost', () => { o.ignoreRule(m.rule); remove() })
        return { dom }
      },
    }
  }, { hoverTime: 250 })
}

export const languageToolExt = (o: LTOptions) => [ltField, plugin(o), card(o)]
