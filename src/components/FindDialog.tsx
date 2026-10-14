// Find and replace across the manuscript (Ctrl+Shift+F). The list shows every
// match with its words around it; click one to go there, replace one at a time,
// or replace all (each scene is copied to its history first).
import { useEffect, useMemo, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { Replace, Search } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { findAll, pattern, replaceInText, replaceMatch, type FindOptions, type Hit } from '../lib/find'
import { snapshot } from '../writing'
import { getEditorView } from '../editor/actions'
import { numLocale, useT } from '../i18n'

// What you looked for last stays for the next time.
let last: FindOptions & { replacement: string } = { query: '', caseSensitive: false, whole: false, regex: false, replacement: '' }

export default function FindDialog({ onClose }: { onClose: () => void }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const [o, setO] = useState<FindOptions>(() => {
    // The selected words, if any, start the search.
    const v = getEditorView()
    const sel = v && !v.state.selection.main.empty ? v.state.doc.sliceString(v.state.selection.main.from, v.state.selection.main.to) : ''
    return { ...last, query: sel.length > 0 && sel.length <= 80 && !sel.includes('\n') ? sel : last.query }
  })
  const [replacement, setReplacement] = useState(last.replacement)
  useEffect(() => { last = { ...o, replacement } }, [o, replacement])

  const hits = useMemo(() => findAll(book, o, 1000), [book, o])
  const bad = !!o.query && o.regex && !pattern(o, false)
  const scenes = new Set(hits.map(h => h.sceneId)).size
  const n = (x: number) => x.toLocaleString(numLocale())

  const go = (h: Hit) => {
    useStore.getState().setPrefs({ page: false })
    useStore.setState({ jump: { sceneId: h.sceneId, from: h.from, to: h.to } })
    useStore.getState().selectScene(h.sceneId)
    onClose()
  }

  /** Replaces one match in its scene (the scene's history keeps the old text). */
  const replaceOne = (h: Hit) => {
    const st = useStore.getState()
    const scene = st.book!.chapters.flatMap(c => c.scenes).find(s => s.id === h.sceneId)
    if (!scene) return
    snapshot(st.book!.root, scene, true)
    st.updateScene(h.sceneId, { text: scene.text.slice(0, h.from) + replaceMatch(scene.text.slice(h.from, h.to), o, replacement) + scene.text.slice(h.to) })
  }

  const replaceEverywhere = async () => {
    if (!hits.length) return
    if (!(await ask(t('Replace {n} matches in {s} scenes? Each scene keeps a copy of its old text in its history.', { n: hits.length, s: scenes }), { title: t('Replace all'), kind: 'warning' }))) return
    const st = useStore.getState()
    let count = 0
    for (const c of st.book!.chapters) for (const s of c.scenes) {
      const r = replaceInText(s.text, o, replacement)
      if (!r.count) continue
      snapshot(st.book!.root, s, true)
      st.updateScene(s.id, { text: r.text })
      count += r.count
    }
    st.notify('ok', t('{n} matches replaced.', { n: count }))
    onClose()
  }

  return (
    <Dialog wide title={t('Find and replace')} icon={Search} onClose={onClose}
      footer={<>
        <button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Close')}</button>
        <button type="button" className="sk-btn sk-btn-primary" disabled={!hits.length} onClick={replaceEverywhere}><Replace size={14} /> {t('Replace all')}{hits.length ? ` (${n(hits.length)})` : ''}</button>
      </>}>
      <div className="pl-find">
        <input className="sk-input" autoFocus value={o.query} placeholder={t('Find in the manuscript…')} onChange={e => setO({ ...o, query: e.target.value })} />
        <input className="sk-input" value={replacement} placeholder={t('Replace with…')} onChange={e => setReplacement(e.target.value)} />
        <div className="pl-row pl-find-opts">
          <label className="pl-row pl-check-label"><input type="checkbox" className="sk-check" checked={o.caseSensitive} onChange={e => setO({ ...o, caseSensitive: e.target.checked })} /> {t('Match case and accents')}</label>
          <label className="pl-row pl-check-label"><input type="checkbox" className="sk-check" checked={o.whole} onChange={e => setO({ ...o, whole: e.target.checked })} /> {t('Whole word')}</label>
          <label className="pl-row pl-check-label"><input type="checkbox" className="sk-check" checked={o.regex} onChange={e => setO({ ...o, regex: e.target.checked })} /> {t('Regular expression')}</label>
        </div>
        <span className={`sk-hint ${bad ? 'pl-warn' : ''}`}>
          {bad ? t('This regular expression is not valid.')
            : !o.query ? t('Without "match case", capitals and accents are ignored: Elise finds Élise.')
              : hits.length ? t('{n} matches in {s} scenes', { n: n(hits.length), s: scenes }) + (hits.length >= 1000 ? t(' (the first 1,000)') : '')
                : t('No match.')}
        </span>
        <div className="pl-find-list">
          {hits.slice(0, 300).map((h, i) => (
            <div key={i} className="pl-find-row">
              <button type="button" className="pl-find-main" onClick={() => go(h)} title={t('Go to this place')}>
                <span className="pl-find-where">{h.chapter} · {h.scene}</span>
                <span className="pl-find-ctx">…{h.before}<mark>{h.match}</mark>{h.after}…</span>
              </button>
              <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => replaceOne(h)} disabled={!o.query}>{t('Replace')}</button>
            </div>
          ))}
          {hits.length > 300 && <span className="sk-hint">{t('Only the first 300 are listed; Replace all covers every match.')}</span>}
        </div>
      </div>
    </Dialog>
  )
}
