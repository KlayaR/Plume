// Settings → Voice: how the AI should write this book. The prompt library
// (yours and the genre presets), tense, adult fiction, scene rules, your
// measurable rules, and the style profile measured from your own prose.
import { useMemo, useState } from 'react'
import { Copy, Plus, Sparkles, Trash2 } from 'lucide-react'
import { SettingRow, SettingsSection, Switch } from '../studio-kit/shell.js'
import { useStore } from '../store'
import type { Rules, SceneRule, Voice } from '../lib/types'
import { allPrompts, loadPrompts, PRESETS, savePrompts, SCENE_RULES, VARIABLES, type PromptSet } from '../lib/voice'
import { profile } from '../lib/analysis'
import { newId } from '../lib/text'
import { ask } from '../ai'
import { refreshSnapshots } from '../library'
import { numLocale, useT } from '../i18n'

const n = (x: number, d = 0) => x.toLocaleString(numLocale(), { maximumFractionDigits: d, minimumFractionDigits: d })

export default function VoiceSettings() {
  const book = useStore(s => s.book)!
  const voice = book.meta.voice
  const t = useT()
  const set = (patch: Partial<Voice>) => useStore.getState().updateMeta({ voice: { ...voice, ...patch } })
  const setRule = (patch: Partial<Rules>) => set({ rules: { ...voice.rules, ...patch } })
  const toggleScene = (id: SceneRule, on: boolean) => set({ sceneRules: on ? [...voice.sceneRules, id] : voice.sceneRules.filter(r => r !== id) })

  return (
    <>
      <PromptLibrary />

      <SettingsSection title={t('This book’s voice')} description={t('Sent with every request for this book.')}>
        <SettingRow label={t('Tense and person')} description={t('Also fills {book.tense} in your prompts')}>
          <input className="sk-input pl-wide" value={voice.tense} placeholder={book.meta.language === 'fr' ? 'passé simple, troisième personne' : 'past tense, third person'} onChange={e => set({ tense: e.target.value })} />
        </SettingRow>
        <SettingRow label={t('Adult literary fiction')} description={t('Tells Claude the book is adult fiction that may treat dark themes seriously. No other wording is added.')}>
          <Switch checked={voice.adult} onChange={v => set({ adult: v })} label={t('Adult literary fiction')} />
        </SettingRow>
        <div className="pl-opt-group">{t('Scene rules')}</div>
        {SCENE_RULES.map(r => (
          <SettingRow key={r.id} label={t(r.label)}>
            <Switch checked={voice.sceneRules.includes(r.id)} onChange={v => toggleScene(r.id, v)} label={t(r.label)} />
          </SettingRow>
        ))}
      </SettingsSection>

      <SettingsSection title={t('Your rules')} description={t('Every proposal is checked against these, without the AI. A failed rule gets "Retry fixing these".')}>
        <SettingRow label={t('Passive voice, at most')} description={t('% of sentences')}>
          <input className="sk-input pl-num" type="number" min={0} max={50} value={voice.rules.passiveMax} onChange={e => setRule({ passiveMax: Number(e.target.value) || 0 })} />
        </SettingRow>
        <SettingRow label={t('Adverbs, at most')} description={t('per 250 words (-ment / -ly)')}>
          <input className="sk-input pl-num" type="number" min={0} max={20} step={0.5} value={voice.rules.adverbsPer250} onChange={e => setRule({ adverbsPer250: Number(e.target.value) || 0 })} />
        </SettingRow>
        <SettingRow label={t('Longest line of dialogue')} description={t('words')}>
          <input className="sk-input pl-num" type="number" min={5} max={400} value={voice.rules.dialogueMaxWords} onChange={e => setRule({ dialogueMaxWords: Number(e.target.value) || 60 })} />
        </SettingRow>
        <SettingRow label={t('Longest sentence')} description={t('words')}>
          <input className="sk-input pl-num" type="number" min={5} max={400} value={voice.rules.sentenceMaxWords} onChange={e => setRule({ sentenceMaxWords: Number(e.target.value) || 45 })} />
        </SettingRow>
        <SettingRow label={t('Dialogue opens with an em dash')} description={t('No quotation marks, no hyphen')}>
          <Switch checked={voice.rules.dashDialogue} onChange={v => setRule({ dashDialogue: v })} label={t('Dialogue opens with an em dash')} />
        </SettingRow>
        <p className="sk-hint">{t('Banned words come from the word lists in the bible (Bible → New entry → Word list).')}</p>
      </SettingsSection>

      <StyleProfile />
    </>
  )
}

function PromptLibrary() {
  const book = useStore(s => s.book)!
  const voice = book.meta.voice
  const t = useT()
  const [mine, setMine] = useState<PromptSet[]>(loadPrompts)
  const [editing, setEditing] = useState<string | null>(null)
  const save = (list: PromptSet[]) => {
    setMine(list)
    savePrompts(list)
    // The book keeps its own copy of the prompts it uses.
    setTimeout(() => refreshSnapshots(useStore.getState().book!), 0)
  }
  const add = (from?: PromptSet) => {
    const p = { id: newId(), name: from ? `${t(from.name)} (${t('copy')})` : t('My prompt'), text: from?.text ?? '' }
    save([...mine, p])
    setEditing(p.id)
  }
  const current = mine.find(p => p.id === editing)
  const all = allPrompts()

  return (
    <SettingsSection title={t('Prompt library')} description={t('Your own instruction sets, kept on this computer for all your books. Each book picks one; each action can override it in the Claude panel.')}>
      <SettingRow label={t('This book uses')}>
        <select className="sk-select" value={voice.prompt} onChange={e => { useStore.getState().updateMeta({ voice: { ...voice, prompt: e.target.value } }); setTimeout(() => refreshSnapshots(useStore.getState().book!), 0) }}>
          <option value="">{t('No prompt')}</option>
          {all.map(p => <option key={p.id} value={p.id}>{p.preset ? `${t(p.name)} (${t('preset')})` : p.name}</option>)}
        </select>
      </SettingRow>
      <div className="pl-promptlist">
        {PRESETS.map(p => (
          <div key={p.id} className="pl-promptrow">
            <span className="pl-grow">{t(p.name)} <span className="sk-badge">{t('preset')}</span></span>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => add(p)} title={t('Copy to edit it')}><Copy size={13} /> {t('Copy')}</button>
          </div>
        ))}
        {mine.map(p => (
          <div key={p.id} className={`pl-promptrow ${editing === p.id ? 'pl-active' : ''}`}>
            <button type="button" className="pl-quiet pl-grow pl-left" onClick={() => setEditing(editing === p.id ? null : p.id)}>{p.name}</button>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('Delete')} onClick={() => { save(mine.filter(x => x.id !== p.id)); if (editing === p.id) setEditing(null) }}><Trash2 size={13} /></button>
          </div>
        ))}
        <button type="button" className="sk-btn sk-btn-sm" onClick={() => add()}><Plus size={13} /> {t('New prompt')}</button>
      </div>
      {current && (
        <div className="pl-promptedit">
          <input className="sk-input" value={current.name} onChange={e => save(mine.map(p => p.id === current.id ? { ...p, name: e.target.value } : p))} aria-label={t('Name')} />
          <textarea className="sk-input pl-full" rows={10} value={current.text} placeholder={t('Paste your instructions here: voice, rules, what to avoid…')}
            onChange={e => save(mine.map(p => p.id === current.id ? { ...p, text: e.target.value } : p))} />
          <span className="sk-hint">{t('Variables:')} {VARIABLES.join(' ')}</span>
        </div>
      )}
    </SettingsSection>
  )
}

function StyleProfile() {
  const book = useStore(s => s.book)!
  const voice = book.meta.voice
  const lang = book.meta.language
  const t = useT()
  const [busy, setBusy] = useState(false)
  const excerpts = book.entries.filter(e => e.type === 'excerpt' && e.full.trim())
  // Your excerpts if you gave some; otherwise the scenes you marked revised or done.
  const sample = useMemo(() => {
    if (excerpts.length) return excerpts.map(e => e.full).join('\n')
    return book.chapters.flatMap(c => c.scenes).filter(s => s.status !== 'draft').map(s => s.text).join('\n')
  }, [book.chapters, excerpts])
  const p = useMemo(() => profile(sample, lang), [sample, lang])

  const describe = async () => {
    setBusy(true)
    try {
      const text = await ask({
        model: 'sonnet', effort: 'medium',
        system: lang === 'fr'
          ? 'Tu es éditeur littéraire. Décris la voix d’un auteur à partir de ses textes, pour qu’un coauteur puisse l’imiter.'
          : 'You are a literary editor. Describe an author’s voice from their prose, so a co-writer can imitate it.',
        message: `<prose>\n${sample.slice(0, 12000)}\n</prose>\n\n${lang === 'fr'
          ? 'Décris cette voix en 6 à 10 lignes concrètes et imitables : rythme des phrases, registre, images, dialogues, ponctuation, ce que l’auteur évite. Pas de compliments, pas de titre.'
          : 'Describe this voice in 6 to 10 concrete, imitable lines: sentence rhythm, register, imagery, dialogue, punctuation, what the author avoids. No praise, no title.'}`,
      })
      useStore.getState().updateMeta({ voice: { ...useStore.getState().book!.meta.voice, description: text.trim() } })
    } catch (e) { useStore.getState().notify('error', String((e as Error).message ?? e)) }
    setBusy(false)
  }

  return (
    <SettingsSection title={t('Style profile')} description={excerpts.length ? t('Measured from your {n} excerpts in the bible.', { n: excerpts.length }) : t('Measured from your revised and done scenes. Add excerpts of your prose in the bible for a better profile.')}>
      {p.words < 200 ? <p className="sk-hint">{t('Not enough of your prose yet (200 words at least).')}</p> : (
        <dl className="pl-stats pl-profile">
          <dt>{t('Words measured')}</dt><dd>{n(p.words)}</dd>
          <dt>{t('Average sentence')}</dt><dd>{n(p.avgSentence, 1)} {t('words')} (± {n(p.sentenceSpread, 1)})</dd>
          <dt>{t('Dialogue')}</dt><dd>{n(p.dialogueShare * 100)} %</dd>
          <dt>{t('Adverbs')}</dt><dd>{n(p.adverbsPer1000, 1)} / 1 000 {t('words')}</dd>
          <dt>{t('Passive voice')}</dt><dd>{n(p.passivePct, 1)} %</dd>
          <dt>{t('Filter words')}</dt><dd>{n(p.filterPer1000, 1)} / 1 000 {t('words')}</dd>
          <dt>{t('Readability')}</dt><dd>{n(p.readability)}</dd>
          <dt>{t('Favourite words')}</dt><dd className="pl-wrap">{p.top.slice(0, 8).map(([w, c]) => `${w} (${c})`).join(', ')}</dd>
        </dl>
      )}
      <div className="sk-field">
        <label>{t('Your voice, in words')}</label>
        <textarea className="sk-input" rows={6} value={voice.description} placeholder={t('Written once by Claude from your prose, then yours to edit. Sent with every request.')}
          onChange={e => useStore.getState().updateMeta({ voice: { ...voice, description: e.target.value } })} />
        <div className="pl-row">
          <button type="button" className="sk-btn sk-btn-sm" disabled={busy || p.words < 200} onClick={describe}><Sparkles size={13} /> {busy ? t('Reading your prose…') : t('Describe my voice')}</button>
          <span className="sk-hint">{t('One Sonnet call, about {n} tokens.', { n: n(Math.min(sample.length, 12000) / 3.6 + 300) })}</span>
        </div>
      </div>
      <div className="sk-field">
        <label>{t('What your choices taught')}</label>
        <textarea className="sk-input" rows={4} value={voice.taste} placeholder={t('Learned from the proposals you accept and discard. Use "Learn from my choices" in the Claude panel.')}
          onChange={e => useStore.getState().updateMeta({ voice: { ...voice, taste: e.target.value } })} />
      </div>
    </SettingsSection>
  )
}
