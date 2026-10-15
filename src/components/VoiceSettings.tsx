// Settings → Voice: how the AI should write this book. The prompt library
// (yours and the genre presets), tense, adult fiction, scene rules, your
// measurable rules, and the style profile measured from your own prose.
import { useMemo, useState } from 'react'
import { Copy, Plus, Sparkles, Trash2 } from 'lucide-react'
import { SettingRow, SettingsSection, Switch } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { EntryEditor } from './BibleView'
import { typeInfo, VOICE_TYPES, type EntryType } from '../lib/types'
import type { Rules, SceneRule, Voice } from '../lib/types'
import { allPrompts, loadPrompts, PRESETS, promptText, savePrompts, SCENE_RULES, VARIABLES, type PromptSet } from '../lib/voice'
import { profile } from '../lib/analysis'
import { newId } from '../lib/text'
import { ask } from '../ai'
import { applyFantasyDefaults, readTextFile, refreshSnapshots } from '../library'
import { open as openFile } from '@tauri-apps/plugin-dialog'
import { addReference, measure, removeReference, toggleReference, useRefs } from '../lib/references'
import type { Lang } from '../lib/types'
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
      <SettingsSection title={t('1. Your voice')} description={t('How this book is told. Sent with every request for this book.')}>
        <SettingRow label={t('Fantasy defaults')} description={t('Plume’s fantasy preset: deep point of view, the world shown through action, magic with a cost, no info-dumps, no clichés. Sets the prompt, scene rules, your rules and two word lists (your tense, adult setting, voice description and taste are kept).')}>
          <button type="button" className="sk-btn sk-btn-sm" onClick={() => { applyFantasyDefaults(useStore.getState().book!, true); useStore.getState().notify('ok', t('Fantasy voice settings applied.')) }}>{t('Apply')}</button>
        </SettingRow>
        <SettingRow label={t('Tense and person')} description={t('Also fills {book.tense} in your prompts')}>
          <input data-lt className="sk-input pl-wide" value={voice.tense} placeholder={book.meta.language === 'fr' ? 'passé simple, troisième personne' : 'past tense, third person'} onChange={e => set({ tense: e.target.value })} />
        </SettingRow>
        <SettingRow label={t('Adult literary fiction')} description={t('Tells Claude the book is adult fiction that may treat dark themes seriously. No other wording is added.')}>
          <Switch checked={voice.adult} onChange={v => set({ adult: v })} label={t('Adult literary fiction')} />
        </SettingRow>
      </SettingsSection>

      <VoiceMaterials />

      <SettingsSection title={t('2. Your rules')} description={t('Every proposal is checked against these, without the AI. A failed rule gets "Retry fixing these".')}>
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
        <p className="sk-hint">{t('Banned words come from your word lists (Your voice materials, above).')}</p>
      </SettingsSection>

      <PromptLibrary />

      <details className="pl-advanced pl-voiceadv">
        <summary>{t('Advanced')} <span className="sk-hint">{t('scene rules, style profile, reference books')}</span></summary>
        <SettingsSection title={t('Scene rules')} description={t('Sent with every request for this book.')}>
          {SCENE_RULES.map(r => (
            <SettingRow key={r.id} label={t(r.label)}>
              <Switch checked={voice.sceneRules.includes(r.id)} onChange={v => toggleScene(r.id, v)} label={t(r.label)} />
            </SettingRow>
          ))}
        </SettingsSection>
        <StyleProfile />
        <ReferenceBooks />
      </details>
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
    const p = { id: newId(), name: from ? `${t(from.name)} (${t('copy')})` : t('My prompt'), text: from ? promptText(from, book.meta.language) : '' }
    save([...mine, p])
    setEditing(p.id)
  }
  const current = mine.find(p => p.id === editing)
  const all = allPrompts()

  return (
    <SettingsSection title={t('3. Your prompt')} description={t('Your own instruction sets, kept on this computer for all your books. Each book picks one; each action can override it in the Claude panel.')}>
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

/** Novels you admire, measured here: only the numbers are kept, and Review compares you with them. */
function ReferenceBooks() {
  const book = useStore(s => s.book)!
  const list = useRefs(s => s.list)
  const t = useT()
  const [lang, setLang] = useState<Lang>(book.meta.language)
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const file = await openFile({ title: t('Choose a novel'), filters: [{ name: 'Novel', extensions: ['epub', 'docx', 'md', 'txt'] }] })
    if (typeof file !== 'string') return
    setBusy(true)
    try {
      const text = await readTextFile(file)
      await new Promise(r => setTimeout(r, 50)) // let the "measuring" state show
      addReference(measure(file.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, ''), text, lang, book))
    } catch (e) { useStore.getState().notify('error', t('Could not measure it: {e}', { e: String(e) })) }
    setBusy(false)
  }
  return (
    <SettingsSection title={t('Reference books')} description={t('Novels you admire (EPUB, Word, text), measured on this computer: Plume keeps only the numbers, never the text. Review then compares your chapters with them instead of with its default targets.')}>
      {list.map(r => (
        <SettingRow key={r.id} label={r.name} description={`${r.lang === 'fr' ? 'Français' : 'English'} · ${n(r.words)} ${t('words')} · ${t('sentences of')} ${n(r.avgSentence, 1)} ${t('words')} · ${n(r.dialogueShare * 100)} % ${t('dialogue')}`}>
          <span className="pl-row">
            <Switch checked={r.on} onChange={v => toggleReference(r.id, v)} label={t('Use as targets')} />
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" aria-label={t('Delete')} onClick={() => removeReference(r.id)}><Trash2 size={13} /></button>
          </span>
        </SettingRow>
      ))}
      <SettingRow label={t('Add a novel')} description={t('Language of the novel')}>
        <span className="pl-row">
          <select className="sk-select" value={lang} onChange={e => setLang(e.target.value as Lang)}><option value="fr">Français</option><option value="en">English</option></select>
          <button type="button" className="sk-btn sk-btn-sm" disabled={busy} onClick={add}><Plus size={13} /> {busy ? t('Measuring…') : t('Choose…')}</button>
        </span>
      </SettingRow>
    </SettingsSection>
  )
}

/** The style guide, word lists and excerpts of your prose: bible files that shape
 *  the voice rather than the story, so they are edited here, not in the bible list. */
function VoiceMaterials() {
  const entries = useStore(s => s.book!.entries)
  const t = useT()
  const [open, setOpen] = useState<string | null>(null)
  const items = entries.filter(e => VOICE_TYPES.includes(e.type)).sort((a, b) => VOICE_TYPES.indexOf(a.type) - VOICE_TYPES.indexOf(b.type) || a.name.localeCompare(b.name))
  const current = items.find(e => e.slug === open) ?? null
  const add = (type: EntryType) => {
    const name = type === 'wordlist' ? t('Banned words') : t('Excerpt {n}', { n: items.filter(e => e.type === 'excerpt').length + 1 })
    setOpen(useStore.getState().addEntry(type, name).slug)
  }
  return (
    <SettingsSection title={t('Your voice materials')} description={t('The style guide, word lists and excerpts of your own prose. They are sent with requests to shape how Claude writes, not what happens.')}
      actions={<>
        <button type="button" className="sk-btn sk-btn-sm" onClick={() => add('wordlist')}><Plus size={13} /> {t('Word list')}</button>
        <button type="button" className="sk-btn sk-btn-sm" onClick={() => add('excerpt')}><Plus size={13} /> {t('Excerpt')}</button>
      </>}>
      {items.length === 0 && <div className="sk-hint">{t('Nothing yet. An excerpt of a few hundred words of your own prose helps Claude most.')}</div>}
      <div className="sk-list">
        {items.map(e => (
          <button key={e.slug} type="button" className={`sk-list-row pl-recent ${e.slug === open ? 'pl-active' : ''}`} onClick={() => setOpen(e.slug === open ? null : e.slug)}>
            <span className="sk-grow">{e.name}</span><span className="sk-hint">{t(typeInfo(e.type).label)}</span>
          </button>
        ))}
      </div>
      {current && <div className="pl-voicemat"><EntryEditor key={current.slug} entry={current} /></div>}
    </SettingsSection>
  )
}
