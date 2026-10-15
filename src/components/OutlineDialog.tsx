// Outline from a premise: you write a few lines, Claude proposes chapters and
// scenes (using the bible), you read the list and add it to the plan.
import { useState } from 'react'
import { foldText } from '../lib/text'
import { ListTree, Sparkles } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { WORLD_TYPES, type Book, type EntryType } from '../lib/types'
import { ask, parseJSON } from '../ai'
import { useT } from '../i18n'

interface Outline { title: string; goal?: string; ending?: string; scenes: { title: string; note: string; pov?: string; place?: string }[] }

/** What makes a scene, said once to Claude so the outline isn't a grid of identical chapters. */
const SCENE_RULES = {
  en: `What a scene is:
- One continuous moment: one place, unbroken time, one point-of-view character. A change of any of these starts a new scene.
- Something changes: someone wants something, meets an obstacle, and the scene ends with the situation different (better, worse, a revelation, a decision). If nothing changes, it is not a scene.
- Action scenes are often followed by a quieter reaction scene (feeling, dilemma, decision).
- In fantasy a scene runs about 1,000 to 4,000 words, a chapter about 2,000 to 5,000.
- The number of scenes per chapter follows what the chapter needs: a battle or a confrontation can be one long scene, a journey or a setup chapter several short ones. Never give every chapter the same number of scenes.

What a chapter is:
- A concrete, immediate goal for the point-of-view character (get past the guard, decode one line), not the big quest.
- It escalates: each attempt gives “yes, but…” or “no, and what’s more…”.
- It ends on a turn: the problem solved reveals a worse one, a revelation forces a new plan, a quiet chapter lands on an image or a realisation, or a question is left that the next chapter answers. No mid-action cliffhanger.`,
  fr: `Ce qu’est une scène :
- Un seul moment continu : un lieu, un temps sans coupure, un personnage de point de vue. Si l’un des trois change, c’est une nouvelle scène.
- Quelque chose change : quelqu’un veut quelque chose, rencontre un obstacle, et la scène finit sur une situation différente (meilleure, pire, une révélation, une décision). Si rien ne change, ce n’est pas une scène.
- Une scène d’action est souvent suivie d’une scène de réaction plus calme (émotion, dilemme, décision).
- En fantasy, une scène fait environ 1 000 à 4 000 mots, un chapitre environ 2 000 à 5 000.
- Le nombre de scènes par chapitre suit ce dont le chapitre a besoin : une bataille ou une confrontation peut être une seule longue scène, un voyage ou un chapitre d’installation plusieurs courtes. Ne donne jamais le même nombre de scènes à tous les chapitres.

Ce qu’est un chapitre :
- Un but concret et immédiat pour le personnage du point de vue (passer le garde, déchiffrer une ligne), pas la grande quête.
- Il monte en tension : chaque tentative donne « oui, mais… » ou « non, et en plus… ».
- Il finit sur un tournant : le problème réglé en révèle un pire, une révélation oblige à revoir le plan, un chapitre calme se pose sur une image ou une prise de conscience, ou il laisse une question à laquelle le chapitre suivant répond. Pas de suspense coupé en pleine action.`,
}

/** A bible entry named (or aliased) exactly so, of one of these types. */
const findEntry = (book: Book, name: string | undefined, types: EntryType[]) => {
  const f = foldText(String(name ?? '').trim())
  if (!f) return null
  return book.entries.find(e => types.includes(e.type) && [e.name, ...e.aliases].some(a => foldText(a.replace(/!$/, '')) === f))?.slug ?? null
}

export default function OutlineDialog({ onClose }: { onClose: () => void }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const lang = book.meta.language
  const [premise, setPremise] = useState(book.meta.summary ?? '')
  const [chapters, setChapters] = useState(12)
  // Scenes per chapter: Claude decides from what each chapter needs, or within a range you set.
  const [range, setRange] = useState<[number, number] | null>(null)
  const [words, setWords] = useState(book.meta.goal.book || 90000)
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
          ? `${SCENE_RULES.fr}\n\nPropose ${chapters} chapitres pour un livre d’environ ${words.toLocaleString('fr-FR')} mots${range ? `, de ${range[0]} à ${range[1]} scènes par chapitre selon ce que chacun demande` : ''}. Chaque scène a un titre court, une note d’une ou deux phrases (qui veut quoi, ce qui l’en empêche, ce qui change à la fin), son personnage de point de vue et son lieu, avec les noms de la bible quand ils y sont. Chaque chapitre a son but immédiat (goal) et sa fin (ending : le tournant ou la question sur lesquels il se termine). Respecte la structure donnée si elle existe.`
          : `${SCENE_RULES.en}\n\nPropose ${chapters} chapters for a book of about ${words.toLocaleString('en-US')} words${range ? `, ${range[0]} to ${range[1]} scenes per chapter as each one needs` : ''}. Each scene gets a short title, a one-or-two-sentence note (who wants what, what stands in the way, what changes by the end), its point-of-view character and its place, using the bible's names when they are there. Each chapter gets its immediate goal (goal) and its ending (the turn or question it lands on). Follow the given structure if there is one.`}\nJSON: [{"title": "...", "goal": "...", "ending": "...", "scenes": [{"title": "...", "note": "...", "pov": "...", "place": "..."}]}]`,
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
      const kept = c.scenes.filter((_, si) => !off.has(`${ci}-${si}`))
      if (!kept.length) return
      // The chapter's goal goes in its first scene's note, its ending in its last one's: writing from the plan reads them there.
      const fr = lang === 'fr'
      const scenes = kept.map((s, i) => ({ ...s, note: [
        String(s.note ?? '').trim(),
        i === 0 && c.goal?.trim() ? `${fr ? 'But du chapitre' : 'Chapter goal'} : ${c.goal.trim()}` : '',
        i === kept.length - 1 && c.ending?.trim() ? `${fr ? 'Fin du chapitre' : 'Chapter ending'} : ${c.ending.trim()}` : '',
      ].filter(Boolean).join('\n') }))
      made++
      // A chapter that already has this title receives the scenes; otherwise a new chapter is made.
      const same = useStore.getState().book!.chapters.find(x => x.title.trim() && foldText(x.title) === foldText(String(c.title ?? '')))
      // POV and place become the card's own fields when the bible knows them.
      const fields = (s: Outline['scenes'][number]) => {
        const pov = findEntry(book, s.pov, ['character'])
        const place = findEntry(book, s.place, ['place'])
        return { ...(pov ? { pov } : {}), ...(place ? { place } : {}) }
      }
      const put = (chapterId: string, s: Outline['scenes'][number]) => {
        const sid = useStore.getState().addScene(chapterId, String(s.title ?? ''), { stay: true, note: String(s.note ?? '') })
        const f = fields(s)
        if (Object.keys(f).length) useStore.getState().updateScene(sid, f)
      }
      if (same) { scenes.forEach(s => put(same.id, s)); return }
      const id = st.addChapter(String(c.title ?? ''), { stay: true })
      const chapter = useStore.getState().book!.chapters.find(x => x.id === id)!
      scenes.forEach((s, i) => {
        if (i === 0) useStore.getState().updateScene(chapter.scenes[0].id, { title: String(s.title ?? ''), note: String(s.note ?? ''), ...fields(s) })
        else put(id, s)
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
          <label className="pl-row">{t('Book length')}
            <input type="number" className="sk-input" style={{ width: '7rem' }} min={10000} max={400000} step={5000} value={words} onChange={e => setWords(Math.max(10000, Math.min(400000, Number(e.target.value) || 90000)))} />
            {t('words')}
          </label>
          <label className="pl-row">{t('Scenes per chapter')}
            <select className="sk-select" value={range ? 'range' : 'auto'} onChange={e => setRange(e.target.value === 'auto' ? null : [1, 4])}>
              <option value="auto">{t('As each chapter needs')}</option>
              <option value="range">{t('Between…')}</option>
            </select>
            {range && <>
              <input type="number" className="sk-input" style={{ width: '4rem' }} min={1} max={10} value={range[0]} onChange={e => setRange([Math.max(1, Math.min(range[1], Number(e.target.value) || 1)), range[1]])} aria-label={t('At least')} />
              <span>–</span>
              <input type="number" className="sk-input" style={{ width: '4rem' }} min={1} max={10} value={range[1]} onChange={e => setRange([range[0], Math.max(range[0], Math.min(10, Number(e.target.value) || range[0]))])} aria-label={t('At most')} />
            </>}
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
              {(c.goal || c.ending) && <span className="sk-hint">{[c.goal && `${t('Goal')} : ${c.goal}`, c.ending && `${t('Ending')} : ${c.ending}`].filter(Boolean).join(' · ')}</span>}
              {c.scenes.map((s, j) => (
                <label key={j} className="pl-outline-sc pl-row pl-check-label">
                  <input type="checkbox" className="sk-check" checked={!off.has(`${i}-${j}`)} onChange={() => toggle(`${i}-${j}`)} />
                  <span><span>{s.title}</span> <span className="sk-hint">{[s.pov, s.place].filter(Boolean).join(' · ')}{s.pov || s.place ? ' — ' : ''}{s.note}</span></span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
