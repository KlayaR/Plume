// Synonyms in context (Ctrl+Shift+Y): select a word or a short phrase, and
// Haiku suggests alternatives that fit this sentence, not a dictionary list.
// Click one to replace the selection.
import { useEffect, useRef, useState } from 'react'
import { Replace } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { ask, parseJSON } from '../ai'
import { getEditorView } from '../editor/actions'
import { useT } from '../i18n'

export default function SynonymDialog({ onClose }: { onClose: () => void }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const lang = book.meta.language
  const target = useRef<{ from: number; to: number; word: string; context: string } | null>(null)
  const [words, setWords] = useState<string[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  if (!target.current) {
    const v = getEditorView()
    const sel = v?.state.selection.main
    if (v && sel && !sel.empty && sel.to - sel.from <= 60) {
      const doc = v.state.doc.toString()
      const start = Math.max(doc.lastIndexOf('\n', sel.from) + 1, sel.from - 220)
      const endNl = doc.indexOf('\n', sel.to)
      const end = Math.min(endNl < 0 ? doc.length : endNl, sel.to + 220)
      target.current = { from: sel.from, to: sel.to, word: doc.slice(sel.from, sel.to), context: doc.slice(start, sel.from) + '[[' + doc.slice(sel.from, sel.to) + ']]' + doc.slice(sel.to, end) }
    }
  }

  useEffect(() => {
    const tg = target.current
    if (!tg) { setBusy(false); return }
    let off = false
    ask({
      model: 'haiku', effort: 'low',
      system: lang === 'fr'
        ? 'Tu es un dictionnaire de synonymes pour un romancier de fantasy. Réponds uniquement par un tableau JSON de chaînes.'
        : 'You are a thesaurus for a fantasy novelist. Reply with a JSON array of strings only.',
      message: lang === 'fr'
        ? `Phrase : ${tg.context}\n\nPropose 8 façons de remplacer ce qui est entre [[ ]], qui s’accordent grammaticalement avec la phrase, de registres variés (du plus simple au plus recherché), sans cliché. Même forme (genre, nombre, temps) que l’original.\nJSON: ["...", "..."]`
        : `Sentence: ${tg.context}\n\nSuggest 8 replacements for what is between [[ ]] that fit the sentence grammatically, in varied registers (plain to rich), no clichés. Same form (number, tense) as the original.\nJSON: ["...", "..."]`,
    }).then(r => {
      if (off) return
      const list = parseJSON<string[]>(r)
      if (!list?.length) setError(t('Claude’s reply could not be read. Try again.'))
      else setWords(list.map(String).filter(w => w.trim() && w.trim() !== tg.word).slice(0, 10))
    }).catch(e => { if (!off) setError((e as Error).message) }).finally(() => { if (!off) setBusy(false) })
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = (w: string) => {
    const tg = target.current, v = getEditorView()
    if (!tg || !v) return
    // The word is still where it was, unless the text moved while the list loaded.
    if (v.state.doc.sliceString(tg.from, tg.to) !== tg.word) { useStore.getState().notify('warn', t('The text moved; select the word again.')); return onClose() }
    v.dispatch({ changes: { from: tg.from, to: tg.to, insert: w }, selection: { anchor: tg.from + w.length } })
    v.focus()
    onClose()
  }

  return (
    <Dialog title={t('Synonyms')} icon={Replace} onClose={onClose}
      footer={<button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Close')}</button>}>
      {!target.current
        ? <p className="sk-hint">{t('Select a word or a short phrase in the text first.')}</p>
        : <div className="pl-find">
          <span className="sk-hint">{t('Instead of')} « {target.current.word} »</span>
          {busy && <span className="sk-hint">{t('Thinking…')}</span>}
          {error && <span className="sk-hint pl-warn">{error}</span>}
          <div className="pl-synonyms">
            {words.map(w => <button key={w} type="button" className="sk-btn" onClick={() => pick(w)}>{w}</button>)}
          </div>
        </div>}
    </Dialog>
  )
}
