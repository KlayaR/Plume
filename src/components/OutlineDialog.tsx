// Outline from a premise: you write a few lines, Claude proposes chapters and
// scenes (using the bible), you read the list and add it to the plan. This is
// the first pass; Plan → Outline then details each chapter (the second pass).
import { useState } from 'react'
import { foldText } from '../lib/text'
import { ListTree, Sparkles } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { WORLD_TYPES } from '../lib/types'
import { findEntrySlug, outlineRules, type SceneMode } from '../lib/outline'
import { ask, parseJSON } from '../ai'
import { useT } from '../i18n'

interface Outline { title: string; goal?: string; ending?: string; scenes: { title: string; summary?: string; note?: string; pov?: string; place?: string }[] }

export default function OutlineDialog({ onClose }: { onClose: () => void }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const lang = book.meta.language
  const fr = lang === 'fr'
  const [premise, setPremise] = useState(book.meta.summary ?? '')
  const [chapters, setChapters] = useState(12)
  // Scenes per chapter: mostly one (the default), as each chapter needs, or within a range you set.
  const [mode, setMode] = useState<SceneMode>({ kind: 'one' })
  const [words, setWords] = useState(book.meta.goal.book || 90000)
  const [busy, setBusy] = useState(false)
  const [outline, setOutline] = useState<Outline[]>([])
  /** Scenes (key "c-s") the author unticked. */
  const [off, setOff] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setOff(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const noteOf = (s: Outline['scenes'][number]) => String(s.summary ?? s.note ?? '').trim()

  const generate = async () => {
    setBusy(true)
    try {
      const bible = book.entries.filter(e => WORLD_TYPES.includes(e.type) && e.include !== 'secret' && e.short)
        .map(e => `- ${e.name} (${e.type}): ${e.short}`).join('\n')
      const beats = book.meta.structure.beats.map(b => `- ${b.name} (${b.at} %)`).join('\n')
      const reply = await ask({
        model: 'sonnet', effort: 'medium',
        system: fr
          ? 'Tu aides un romancier de fantasy à bâtir le plan de son livre. Réponds uniquement en JSON valide, en français.'
          : 'You help a fantasy novelist build the outline of their book. Reply with valid JSON only.',
        message: `<premise>\n${premise.trim()}\n</premise>\n${bible ? `<bible>\n${bible}\n</bible>\n` : ''}${beats ? `<structure>\n${beats}\n</structure>\n` : ''}\n${outlineRules(lang, mode)}\n\n${fr
          ? `Propose ${chapters} chapitres pour un livre d’environ ${words.toLocaleString('fr-FR')} mots. Chaque chapitre a son but immédiat (goal) et sa fin (ending : le tournant ou la question sur lesquels il se termine). Chaque scène a un titre court, un résumé de 2 à 3 phrases (qui veut quoi, ce qui l’en empêche, ce qui change à la fin), son personnage de point de vue et son lieu, avec les noms de la bible quand ils y sont. Pas encore d’étapes détaillées : elles viendront chapitre par chapitre. Respecte la structure donnée si elle existe.`
          : `Propose ${chapters} chapters for a book of about ${words.toLocaleString('en-US')} words. Each chapter gets its immediate goal (goal) and its ending (the turn or question it lands on). Each scene gets a short title, a 2-to-3-sentence summary (who wants what, what stands in the way, what changes by the end), its point-of-view character and its place, using the bible's names when they are there. No detailed beats yet: they come chapter by chapter. Follow the given structure if there is one.`}\nJSON: [{"title": "...", "goal": "...", "ending": "...", "scenes": [{"title": "...", "summary": "...", "pov": "...", "place": "..."}]}]`,
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
      // POV and place become the card's own fields when the bible knows them.
      const fields = (s: Outline['scenes'][number]) => {
        const pov = findEntrySlug(book, s.pov, ['character'])
        const place = findEntrySlug(book, s.place, ['place'])
        return { ...(pov ? { pov } : {}), ...(place ? { place } : {}) }
      }
      const put = (chapterId: string, s: Outline['scenes'][number]) => {
        const sid = useStore.getState().addScene(chapterId, String(s.title ?? ''), { stay: true, note: noteOf(s) })
        const f = fields(s)
        if (Object.keys(f).length) useStore.getState().updateScene(sid, f)
      }
      const plan = { ...(c.goal?.trim() ? { goal: c.goal.trim() } : {}), ...(c.ending?.trim() ? { ending: c.ending.trim() } : {}) }
      // A chapter that already has this title receives the scenes; otherwise a new chapter is made.
      const same = useStore.getState().book!.chapters.find(x => x.title.trim() && foldText(x.title) === foldText(String(c.title ?? '')))
      if (same) {
        scenes.forEach(s => put(same.id, s))
        if (!same.goal && !same.ending) useStore.getState().updateChapter(same.id, plan)
        return
      }
      const id = st.addChapter(String(c.title ?? ''), { stay: true })
      useStore.getState().updateChapter(id, plan)
      const chapter = useStore.getState().book!.chapters.find(x => x.id === id)!
      scenes.forEach((s, i) => {
        if (i === 0) useStore.getState().updateScene(chapter.scenes[0].id, { title: String(s.title ?? ''), note: noteOf(s), ...fields(s) })
        else put(id, s)
      })
    })
    st.notify('ok', t('{n} chapters added to the plan. Next: Detail each chapter in Plan → Outline.', { n: made }))
    useStore.setState({ view: 'plan', planTab: 'outline' })
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
        <div className="pl-row" style={{ flexWrap: 'wrap' }}>
          <label className="pl-row">{t('Chapters')}
            <input type="number" className="sk-input" style={{ width: '5rem' }} min={3} max={60} value={chapters} onChange={e => setChapters(Math.max(3, Math.min(60, Number(e.target.value) || 12)))} />
          </label>
          <label className="pl-row">{t('Book length')}
            <input type="number" className="sk-input" style={{ width: '7rem' }} min={10000} max={400000} step={5000} value={words} onChange={e => setWords(Math.max(10000, Math.min(400000, Number(e.target.value) || 90000)))} />
            {t('words')}
          </label>
          <label className="pl-row">{t('Scenes per chapter')}
            <select className="sk-select" value={mode.kind} onChange={e => setMode(e.target.value === 'range' ? { kind: 'range', min: 1, max: 3 } : { kind: e.target.value as 'one' | 'auto' })}>
              <option value="one">{t('Mostly one')}</option>
              <option value="auto">{t('As each chapter needs')}</option>
              <option value="range">{t('Between…')}</option>
            </select>
            {mode.kind === 'range' && <>
              <input type="number" className="sk-input" style={{ width: '4rem' }} min={1} max={10} value={mode.min} onChange={e => setMode({ ...mode, min: Math.max(1, Math.min(mode.max, Number(e.target.value) || 1)) })} aria-label={t('At least')} />
              <span>–</span>
              <input type="number" className="sk-input" style={{ width: '4rem' }} min={1} max={10} value={mode.max} onChange={e => setMode({ ...mode, max: Math.max(mode.min, Math.min(10, Number(e.target.value) || mode.min)) })} aria-label={t('At most')} />
            </>}
          </label>
          <span className="pl-grow" />
          <button type="button" className="sk-btn sk-btn-primary" disabled={busy || premise.trim().length < 20} onClick={generate}>
            <Sparkles size={14} /> {busy ? t('Thinking…') : outline.length ? t('Again') : t('Propose an outline')}
          </button>
        </div>
        <span className="sk-hint">{t('Untick the scenes you don’t want. Chapters are added after yours; a chapter with the same title as one of yours receives its scenes. Nothing you wrote is changed. Then detail each chapter in Plan → Outline.')}</span>
        <div className="pl-find-list">
          {outline.map((c, i) => (
            <div key={i} className="pl-outline-ch">
              <b>{i + 1}. {c.title}</b>
              {(c.goal || c.ending) && <span className="sk-hint">{[c.goal && `${t('Goal')} : ${c.goal}`, c.ending && `${t('Ending')} : ${c.ending}`].filter(Boolean).join(' · ')}</span>}
              {c.scenes.map((s, j) => (
                <label key={j} className="pl-outline-sc pl-row pl-check-label">
                  <input type="checkbox" className="sk-check" checked={!off.has(`${i}-${j}`)} onChange={() => toggle(`${i}-${j}`)} />
                  <span><span>{s.title}</span> <span className="sk-hint">{[s.pov, s.place].filter(Boolean).join(' · ')}{s.pov || s.place ? ' — ' : ''}{noteOf(s)}</span></span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
