// The Editing reports in the text: every flagged passage underlined in its category's
// colour. Hover one for what it is, why it matters, and what you can do: leave this one
// alone, leave these words alone everywhere, show only this report, or hide it.
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, hoverTooltip } from '@codemirror/view'
import type { Mark } from '../lib/editing'
import { t } from '../i18n'

export interface EdMarkOptions {
  label: (report: string) => string
  help: (report: string) => string
  /** Leave this passage as it is. `hit`: its words. */
  ignoreHere: (m: Mark, hit: string) => void
  /** Leave these words alone everywhere, for this report. */
  ignoreWord: (m: Mark, hit: string) => void
  only: (report: string) => void
  hide: (report: string) => void
  /** Rewordings of the sentence the mark is in (null: not offered). */
  rephrase?: ((view: EditorView, m: Mark) => void) | null
}

export const setEdMarks = StateEffect.define<Mark[]>()

/** A passage longer than this is a sentence or a paragraph: underlined, not filled, so the page stays readable. */
const LONG = 90

const field = StateField.define<Mark[]>({
  create: () => [],
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setEdMarks)) return e.value
    // While you type, the underlines follow their words until the next reading.
    return tr.docChanged ? v.map(m => ({ ...m, from: tr.changes.mapPos(m.from, 1), to: tr.changes.mapPos(m.to, -1) })).filter(m => m.to > m.from) : v
  },
  provide: f => EditorView.decorations.from(f, list => {
    const b = new RangeSetBuilder<Decoration>()
    for (const m of [...list].sort((a, z) => a.from - z.from || a.to - z.to)) {
      b.add(m.from, m.to, Decoration.mark({ class: `cm-ed cm-ed-${m.category}${m.to - m.from > LONG ? ' cm-ed-long' : ''}` }))
    }
    return b.finish()
  }),
})

function card(o: EdMarkOptions) {
  return hoverTooltip((view, pos) => {
    // The smallest mark under the pointer: a word inside a flagged sentence wins.
    const at = view.state.field(field).filter(x => x.from <= pos && pos <= x.to).sort((a, z) => (a.to - a.from) - (z.to - z.from))[0]
    if (!at) return null
    return {
      pos: at.from, end: at.to, above: true,
      create: () => {
        const hit = view.state.sliceDoc(at.from, at.to)
        const dom = document.createElement('div')
        dom.className = 'cm-namecard cm-ltcard'
        const title = dom.appendChild(document.createElement('div'))
        title.className = 'cm-namecard-name'
        title.textContent = o.label(at.report) + (at.note ? ` · ${at.note}` : '')
        const body = dom.appendChild(document.createElement('div'))
        body.className = 'cm-namecard-body'
        body.textContent = o.help(at.report)
        const row = dom.appendChild(document.createElement('div'))
        row.className = 'cm-card-row'
        const btn = (label: string, cls: string, run: () => void, tip?: string) => {
          const b = row.appendChild(document.createElement('button'))
          b.className = `sk-btn sk-btn-sm ${cls}`
          b.textContent = label
          if (tip) b.title = tip
          b.onmousedown = e => { e.preventDefault(); run() }
        }
        if (o.rephrase) btn(t('Rephrase'), 'sk-btn-primary', () => o.rephrase!(view, at), t('Several rewordings of this sentence, to pick from'))
        btn(t('Ignore here'), '', () => o.ignoreHere(at, hit), t('Leave this passage as it is: it won’t be flagged again'))
        if (hit.length <= 32 && !/\n/.test(hit)) btn(t('Ignore “{w}” everywhere', { w: hit }), 'sk-btn-ghost', () => o.ignoreWord(at, hit), t('For this report, in the whole book'))
        btn(t('Only this report'), 'sk-btn-ghost', () => o.only(at.report))
        btn(t('Hide this report'), 'sk-btn-ghost', () => o.hide(at.report))
        return { dom }
      },
    }
  }, { hoverTime: 350 })
}

export const edMarksExt = (o: EdMarkOptions) => [field, card(o)]

/** The marks now in an editor (for Next / Previous). */
export const edMarksOf = (view: EditorView) => view.state.field(field, false) ?? []
