// Outline from a premise: you write a few lines, Claude proposes chapters and
// scenes (using the bible), you read the list and add it to the plan.
import { useState } from 'react'
import { foldText } from '../lib/text'
import { ListTree, Sparkles } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { WORLD_TYPES } from '../lib/types'
import { ask, parseJSON } from '../ai'
import { useT } from '../i18n'

interface Outline { title: string; scenes: { title: string; note: string }[] }

export default function OutlineDialog({ onClose }: { onClose: () => void }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const lang = book.meta.language
  const [premise, setPremise] = useState(book.meta.summary ?? '')
  const [chapters, setChapters] = useState(12)
  const [busy, setBusy] = useState(false)
  const [outline, setOutline] = useState<Outline[]>([])
  /** Scenes (key "c-s") the author unticked. */
  const [off, setOff] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setOff(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const generate = async () => {
    setBusy(true)
    try {
      const bible = book.entries.filter(e => WORLD_TYPES.includes(e.type) && e.include !== 'secret' && e.short)
        .map(e => `- ${e.name} (${e.type}): ${e.short}`).join('\n')
      const beats = book.meta.structure.beats.map(b => `- ${b.name} (${b.at} %)`).join('\n')
      const reply = await ask({
        model: 'sonnet', effort: 'medium',
        system: lang === 'fr'
          ? 'Tu aides un romancier de fantasy à bâtir le plan de son livre. Réponds uniquement en JSON valide, en français.'
          : 'You help a fantasy novelist build the outline of their book. Reply with valid JSON only.',
        message: `<premise>\n${premise.trim()}\n</premise>\n${bible ? `<bible>\n${bible}\n</bible>\n` : ''}${beats ? `<structure>\n${beats}\n</structure>\n` : ''}\n${lang === 'fr'
          ? `Propose ${chapters} chapitres, chacun de 2 à 4 scènes. Chaque scène a un titre court et une note d’une ou deux phrases : qui veut quoi, ce qui l’en empêche, ce qui change à la fin. Respecte la structure donnée si elle existe.`
          : `Propose ${chapters} chapters of 2 to 4 scenes each. Each scene gets a short title and a one-or-two-sentence note: who wants what, what stands in the way, what changes by the end. Follow the given structure if there is one.`}\nJSON: [{"title": "...", "scenes": [{"title": "...", "note": "..."}]}]`,
      })
      const list = parseJSON<Outline[]>(reply)
      if (!list?.length) throw new Error(t('Claude’s reply could not be read. Try again.'))
      setOutline(list.filter(c => Array.isArray(c.scenes) && c.scenes.length))
      setOff(new Set())
    } catch (e) { useStore.getState().notify('error', (e as Error).message) }
    setBusy(false)
  }

  const add = () => {
    const st = useStore.getState()
    let made = 0
    outline.forEach((c, ci) => {
      const scenes = c.scenes.filter((_, si) => !off.has(`${ci}-${si}`))
      if (!scenes.length) return
      made++
      // A chapter that already has this title receives the scenes; otherwise a new chapter is made.
      const same = useStore.getState().book!.chapters.find(x => x.title.trim() && foldText(x.title) === foldText(String(c.title ?? '')))
      if (same) { scenes.forEach(s => useStore.getState().addScene(same.id, String(s.title ?? ''), { stay: true, note: String(s.note ?? '') })); return }
      const id = st.addChapter(String(c.title ?? ''), { stay: true })
      const chapter = useStore.getState().book!.chapters.find(x => x.id === id)!
      scenes.forEach((s, i) => {
        if (i === 0) useStore.getState().updateScene(chapter.scenes[0].id, { title: String(s.title ?? ''), note: String(s.note ?? '') })
        else useStore.getState().addScene(id, String(s.title ?? ''), { stay: true, note: String(s.note ?? '') })
      })
    })
    st.notify('ok', t('{n} chapters added to the plan.', { n: made }))
    useStore.setState({ view: 'plan', planTab: 'board' })
    onClose()
  }

  return (
    <Dialog wide title={t('Outline from a premise')} icon={ListTree} onClose={onClose}
      footer={<>
        <button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Close')}</button>
        {outline.length > 0 && <button type="button" className="sk-btn sk-btn-primary" onClick={add}>{t('Add to the plan')}</button>}
      </>}>
      <div className="pl-find">
        <textarea className="sk-input" rows={5} autoFocus value={premise} placeholder={t('Your premise: who, what they want, what stands in the way, how it might end…')} onChange={e => setPremise(e.target.value)} />
        <div className="pl-row">
          <label className="pl-row">{t('Chapters')}
            <input type="number" className="sk-input" style={{ width: '5rem' }} min={3} max={60} value={chapters} onChange={e => setChapters(Math.max(3, Math.min(60, Number(e.target.value) || 12)))} />
          </label>
          <span className="pl-grow" />
          <button type="button" className="sk-btn sk-btn-primary" disabled={busy || premise.trim().length < 20} onClick={generate}>
            <Sparkles size={14} /> {busy ? t('Thinking…') : outline.length ? t('Again') : t('Propose an outline')}
          </button>
        </div>
        <span className="sk-hint">{t('Untick the scenes you don’t want. Chapters are added after yours; a chapter with the same title as one of yours receives its scenes. Nothing you wrote is changed.')}</span>
        <div className="pl-find-list">
          {outline.map((c, i) => (
            <div key={i} className="pl-outline-ch">
              <b>{i + 1}. {c.title}</b>
              {c.scenes.map((s, j) => (
                <label key={j} className="pl-outline-sc pl-row pl-check-label">
                  <input type="checkbox" className="sk-check" checked={!off.has(`${i}-${j}`)} onChange={() => toggle(`${i}-${j}`)} />
                  <span><span>{s.title}</span> <span className="sk-hint">{s.note}</span></span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
