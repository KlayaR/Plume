// Settings → Voice: how the AI should write this book. The prompt library
// (yours and the genre presets), tense, adult fiction, scene rules, your
// measurable rules, and the style profile measured from your own prose.
import { useMemo, useState } from 'react'
import { Copy, Plus, Sparkles, Trash2 } from 'lucide-react'
import { SettingRow, SettingsSection, Switch } from '../studio-kit/shell.js'
import { findScene, useStore } from '../store'
import { EntryEditor } from './BibleView'
import { MODELS, typeInfo, VOICE_TYPES, type EntryType, type Model } from '../lib/types'
import type { Rules, SceneRule, Voice } from '../lib/types'
import { choosablePrompts, loadPrompts, loadVoices, MY_VOICE, PRESETS, promptText, savePrompts, saveVoices, SCENE_RULES, VARIABLES, type OwnVoice, type PromptSet, type Sample } from '../lib/voice'
import { profile } from '../lib/analysis'
import { isVoiceSample, systemParts, voiceIssues, type SystemPartKey, type VoiceIssue } from '../lib/context'
import { STOCK_STYLE } from '../lib/project'
import { newId } from '../lib/text'
import { ask } from '../ai'
import { applyFantasyDefaults, readTextFile, refreshSnapshots, switchToMyVoice } from '../library'
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
      <MyVoice />

      <SettingsSection title={t('2. This book')} description={t('Sent with every request for this book.')}>
        <SettingRow label={t('Tense and person')} description={t('Also fills {book.tense} in your prompts')}>
          <input data-lt className="sk-input pl-wide" value={voice.tense} placeholder={book.meta.language === 'fr' ? 'passé simple, troisième personne' : 'past tense, third person'} onChange={e => set({ tense: e.target.value })} />
        </SettingRow>
        <SettingRow label={t('Adult literary fiction')} description={t('Tells Claude the book is adult fiction that may treat dark themes seriously. No other wording is added.')}>
          <Switch checked={voice.adult} onChange={v => set({ adult: v })} label={t('Adult literary fiction')} />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('3. Your rules')} description={t('Every proposal is checked against these, without the AI. A failed rule gets "Retry fixing these".')}>
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
        <p className="sk-hint">{t('Banned words come from your word lists (Advanced).')}</p>
      </SettingsSection>

      <WhatClaudeGets />

      <details className="pl-advanced pl-voiceadv">
        <summary>{t('Advanced')} <span className="sk-hint">{t('other prompts, style guide, word lists, scene rules, style profile, reference books')}</span></summary>
        <SettingsSection title={t('Fantasy defaults')} description={t('Plume’s fantasy preset: deep point of view, the world shown through action, magic with a cost, no info-dumps, no clichés. Sets the prompt, scene rules, your rules and two word lists (your tense, adult setting, voice description and taste are kept).')}>
          <SettingRow label={t('Fantasy defaults')}>
            <button type="button" className="sk-btn sk-btn-sm" onClick={() => { applyFantasyDefaults(useStore.getState().book!, true); useStore.getState().notify('ok', t('Fantasy voice settings applied.')) }}>{t('Apply')}</button>
          </SettingRow>
        </SettingsSection>
        <PromptLibrary />
        <VoiceMaterials />
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

const wordsIn = (s: string) => (s.match(/\S+/g) ?? []).length

/** Your voice for the book's language: your instructions and passages of your prose, for all your books in it. */
function MyVoice() {
  const book = useStore(s => s.book)!
  const lang = book.meta.language
  const t = useT()
  const [all, setAll] = useState(loadVoices)
  const [open, setOpen] = useState<number | null>(null)
  const v: OwnVoice = all[lang] ?? { prompt: '', samples: [] }
  const save = (next: OwnVoice) => {
    const a = { ...all, [lang]: next }
    setAll(a)
    saveVoices(a)
    // The book keeps its own copy of your voice.
    setTimeout(() => refreshSnapshots(useStore.getState().book!), 0)
  }
  const setSample = (i: number, x: Partial<Sample>) => save({ ...v, samples: v.samples.map((s, j) => (j === i ? { ...s, ...x } : s)) })
  const marked = book.chapters.flatMap(c => c.scenes.filter(s => s.voiceRef === true && wordsIn(s.text) >= 60).map(s => ({ name: `${c.title || t('Chapter')} · ${s.title}`, text: s.text.replace(/⟦[^⟧]*⟧/g, '').trim() })))
  const addMarked = () => {
    const fresh = marked.filter(m => !v.samples.some(s => s.text.trim() === m.text))
    save({ ...v, samples: [...v.samples, ...fresh] })
    useStore.getState().notify('ok', t('{n} passage(s) added to your voice.', { n: fresh.length }))
  }
  const total = v.samples.reduce((n, s) => n + wordsIn(s.text), 0)
  const uses = book.meta.voice.prompt === MY_VOICE
  return (
    <SettingsSection title={lang === 'fr' ? t('1. Your voice in French') : t('1. Your voice in English')} description={t('For every book you write in this language, on this computer: your instructions and passages of your own prose. The passages show Claude your voice best.')}>
      {!uses && (
        <div className="pl-voicenote">
          <span className="pl-grow">{t('This book uses another prompt instead of your voice.')}</span>
          <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={() => switchToMyVoice(useStore.getState().book!)}>{t('Write in my voice')}</button>
        </div>
      )}
      <div className="sk-field">
        <label>{t('Your instructions')}</label>
        <textarea className="sk-input pl-full" rows={8} value={v.prompt} placeholder={t('What the passages can’t show: what to avoid, how you write dialogue…')} onChange={e => save({ ...v, prompt: e.target.value })} />
        <span className="sk-hint">{t('Variables:')} {VARIABLES.join(' ')}</span>
      </div>
      <div className="sk-field">
        <label>{t('Passages of your prose')}</label>
        <div className="sk-list">
          {v.samples.map((s, i) => (
            <div key={i} className={`pl-promptrow ${open === i ? 'pl-active' : ''}`}>
              <button type="button" className="pl-quiet pl-grow pl-left" onClick={() => setOpen(open === i ? null : i)}>{s.name || t('Passage {n}', { n: i + 1 })} <span className="sk-hint">{n(wordsIn(s.text))} {t('words')}</span></button>
              <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('Delete')} aria-label={t('Delete')} onClick={() => { save({ ...v, samples: v.samples.filter((_, j) => j !== i) }); setOpen(null) }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        {open !== null && v.samples[open] && (
          <div className="pl-promptedit">
            <input className="sk-input" value={v.samples[open].name} aria-label={t('Name')} onChange={e => setSample(open, { name: e.target.value })} />
            <textarea className="sk-input pl-full" rows={12} value={v.samples[open].text} placeholder={t('Paste a passage of your own prose here.')} onChange={e => setSample(open, { text: e.target.value })} />
          </div>
        )}
        <div className="pl-row">
          <button type="button" className="sk-btn sk-btn-sm" onClick={() => { save({ ...v, samples: [...v.samples, { name: t('Passage {n}', { n: v.samples.length + 1 }), text: '' }] }); setOpen(v.samples.length) }}><Plus size={13} /> {t('Paste a passage')}</button>
          <button type="button" className="sk-btn sk-btn-sm" disabled={!marked.length} title={t('Scenes you marked “Sample of my voice” (right-click a scene)')} onClick={addMarked}><Plus size={13} /> {t('Add the scenes marked in this book ({n})', { n: marked.length })}</button>
        </div>
        <span className="sk-hint">{t('{n} words in all. Scenes you mark as your voice in a book are sent too; the same passage is never sent twice.', { n: n(total) })}</span>
      </div>
    </SettingsSection>
  )
}

/** The stable part of every request, part by part, and what repeats or weakens your voice. */
function WhatClaudeGets() {
  const book = useStore(s => s.book)!
  const sceneId = useStore(s => s.sceneId)
  const t = useT()
  const chapter = findScene(book, sceneId)?.number ?? 1
  const parts = useMemo(() => systemParts(book, 'continue', chapter), [book, chapter])
  const issues = useMemo(() => voiceIssues(book, chapter), [book, chapter])
  const st = () => useStore.getState()
  const voice = book.meta.voice
  const label: Record<SystemPartKey, string> = {
    rules: t('Plume’s rules'), instructions: voice.prompt === MY_VOICE ? t('Your instructions') : t('The book’s prompt'), tone: t('Tone (Plan)'),
    voice: t('Your voice, in words'), taste: t('What your choices taught'), style: t('Style guide'), prose: t('Passages of your prose'),
  }
  const fix = (label: string, run: () => void) => <button type="button" className="sk-btn sk-btn-sm" onClick={run}>{label}</button>
  const say = (i: VoiceIssue) => {
    switch (i.id) {
      case 'other-prompt': return <>{t('This book uses another prompt instead of your voice.')} {fix(t('Write in my voice'), () => switchToMyVoice(st().book!))}</>
      case 'fantasy-style': return <>{t('The style guide is still the fantasy one: it contradicts your voice.')} {fix(t('Empty it'), () => { const s = st().book!.entries.find(e => e.type === 'style'); if (s) st().updateEntry(s.slug, { full: STOCK_STYLE[book.meta.language] }) })}</>
      case 'description': return <>{t('“Your voice, in words” says your voice a second time.')} {fix(t('Clear it'), () => st().updateMeta({ voice: { ...st().book!.meta.voice, description: '' } }))}</>
      case 'scene-rules': return <>{t('{n} scene rule(s) are added to your voice.', { n: i.n })} {fix(t('Turn them off'), () => st().updateMeta({ voice: { ...st().book!.meta.voice, sceneRules: [] } }))}</>
      case 'action-prompts': return <>{t('{n} action(s) use another prompt (Claude panel).', { n: i.n })} {fix(t('Use the book’s'), () => st().updateMeta({ voice: { ...st().book!.meta.voice, actionPrompts: {} } }))}</>
      case 'no-samples': return <>{t('No passage of your prose is sent: add some to your voice, or mark scenes as your voice.')}</>
      case 'cut': return <>{t('“{name}” is cut to {sent} of its {words} words: raise “Samples of your prose” in Settings → Claude.', { name: i.name, sent: n(i.sent), words: n(i.words) })}</>
    }
  }
  const total = parts.reduce((k, p) => k + wordsIn(p.text), 0)
  return (
    <SettingsSection title={t('What Claude receives')} description={t('Sent with every request for this book, before the scene and the bible: {n} words, read once, then from the cache.', { n: n(total) })}>
      {issues.length
        ? <ul className="pl-voiceissues">{issues.map((i, k) => <li key={k}>{say(i)}</li>)}</ul>
        : <p className="sk-hint">{t('Nothing repeats or contradicts your voice.')}</p>}
      <div className="pl-sendparts">
        {parts.map(p => (
          <details key={p.key} className="pl-sendpart">
            <summary>{label[p.key]} <span className="sk-hint">{n(wordsIn(p.text))} {t('words')}</span></summary>
            <pre className="pl-sendtext">{p.text}</pre>
          </details>
        ))}
      </div>
    </SettingsSection>
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
  const all = choosablePrompts()
  const patch = (id: string, x: Partial<PromptSet>) => save(mine.map(p => p.id === id ? { ...p, ...x } : p))

  return (
    <SettingsSection title={t('Other prompts')} description={t('Instruction sets other than your voice, kept on this computer for all your books. A book can use one instead of your voice; each action can override it in the Claude panel.')}>
      <SettingRow label={t('This book uses')}>
        <select className="sk-select" value={voice.prompt} onChange={e => { useStore.getState().updateMeta({ voice: { ...voice, prompt: e.target.value } }); setTimeout(() => refreshSnapshots(useStore.getState().book!), 0) }}>
          <option value="">{t('No prompt')}</option>
          {all.map(p => <option key={p.id} value={p.id}>{p.id === MY_VOICE ? t(p.name) : p.preset ? `${t(p.name)} (${t('preset')})` : p.name}</option>)}
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
            <button type="button" className="pl-quiet pl-grow pl-left" onClick={() => setEditing(editing === p.id ? null : p.id)}>{p.name}{p.fragment ? <> <span className="sk-badge">{t('fragment')}</span></> : p.model ? <> <span className="sk-badge">{p.model}</span></> : null}</button>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('Delete')} onClick={() => { save(mine.filter(x => x.id !== p.id)); if (editing === p.id) setEditing(null) }}><Trash2 size={13} /></button>
          </div>
        ))}
        <button type="button" className="sk-btn sk-btn-sm" onClick={() => add()}><Plus size={13} /> {t('New prompt')}</button>
        <button type="button" className="sk-btn sk-btn-sm" title={t('Writes the scene you are in with two or three setups, shown without their labels, so you can pick the best')} onClick={() => useStore.setState({ dialog: 'trial', showSettings: false })}>{t('Compare prompts')}…</button>
      </div>
      {current && (
        <div className="pl-promptedit">
          <input className="sk-input" value={current.name} onChange={e => save(mine.map(p => p.id === current.id ? { ...p, name: e.target.value } : p))} aria-label={t('Name')} />
          <textarea className="sk-input pl-full" rows={10} value={current.text} placeholder={t('Paste your instructions here: voice, rules, what to avoid…')}
            onChange={e => save(mine.map(p => p.id === current.id ? { ...p, text: e.target.value } : p))} />
          <span className="sk-hint">{t('Variables:')} {VARIABLES.join(' ')}</span>
          <div className="pl-row">
            <label className="sk-hint pl-grow"><input type="checkbox" checked={!!current.fragment} onChange={e => patch(current.id, { fragment: e.target.checked || undefined, ...(e.target.checked ? { model: undefined } : {}) })} /> {t('A fragment: a piece for other prompts, pulled in with {tag}; not offered as a prompt', { tag: `{include.${current.name}}` })}</label>
            {!current.fragment && (
              <select className="sk-select sk-btn-sm" value={current.model ?? ''} aria-label={t('Model')} title={t('The Claude model this prompt writes with; otherwise the drafting model of Settings → Claude')} onChange={e => patch(current.id, { model: (e.target.value || undefined) as Model | undefined })}>
                <option value="">{t('The drafting model')}</option>
                {MODELS.map(m => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
              </select>
            )}
          </div>
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
  // The same prose Claude is given as your voice: scenes you marked, your excerpts, scenes mostly yours.
  const marked = book.chapters.flatMap(c => c.scenes).filter(s => s.text.trim() && isVoiceSample(s))
  const sample = useMemo(() => [...marked.filter(s => s.voiceRef).map(s => s.text), ...excerpts.map(e => e.full), ...marked.filter(s => !s.voiceRef).map(s => s.text)].join('\n'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book.chapters, excerpts])
  const p = useMemo(() => profile(sample, lang), [sample, lang])

  const describe = async () => {
    setBusy(true)
    try {
      const text = await ask({
        role: 'edit',
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
    <SettingsSection title={t('Style profile')} description={t('Measured from the prose Claude takes as your voice: the scenes you marked “Sample of my voice” (right-click a scene), your excerpts, and revised scenes mostly yours.')}>
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
