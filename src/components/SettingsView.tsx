// Settings, as tabs on the left: Appearance, Manuscript, Writing, Claude,
// This book (when one is open), About.
import { useLayoutEffect, useRef, useState } from 'react'
import { BookMarked, Bot, Feather, Info, Palette, PenLine, Type, Settings as Gear } from 'lucide-react'
import { Dialog, SettingRow, SettingsSection, Switch, ThemePicker } from '../studio-kit/shell.js'
import { useStore } from '../store'
import type { MatterKey, Serial } from '../lib/types'
import { isSerial, serialOf } from '../lib/serial'
import { BACK, FRONT, MATTER_LABEL } from '../lib/matter'
import { useT } from '../i18n'
import ManuscriptOptions from './ManuscriptOptions'
import { ModelPresetsSection, RolesSection } from './ModelPresets'
import VoiceSettings from './VoiceSettings'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useEffect } from 'react'
import { backupNow, joinSeries, listBackups, seriesName } from '../library'
import { LT_DEFAULT, ltTest } from '../lib/languagetool'
import { foldText } from '../lib/text'
import { pickImage } from '../lib/images'

type Tab = 'appearance' | 'manuscript' | 'writing' | 'voice' | 'claude' | 'book' | 'about'

/** While searching: keeps the sections and rows whose words match, hides the others. Says whether any is left. */
function filterSettings(body: HTMLElement, query: string) {
  const words = foldText(query).split(/\s+/).filter(Boolean)
  const matches = (el: Element) => { const text = foldText(el.textContent ?? ''); return words.every(w => text.includes(w)) }
  let found = false
  // What a tab draws outside its sections goes by the same rule.
  for (const el of Array.from(body.children) as HTMLElement[]) {
    if (!el.matches('.sk-settings-section, .pl-settings-none')) el.hidden = !matches(el)
    if (el.matches('details') && words.length) (el as HTMLDetailsElement).open = !el.hidden
  }
  body.querySelectorAll<HTMLElement>('.sk-settings-section').forEach(section => {
    const head = section.querySelector('.sk-settings-head')
    const whole = !!head && matches(head)
    let shown = whole
    for (const child of Array.from(section.children) as HTMLElement[]) {
      if (child === head) continue
      child.hidden = !whole && !matches(child)
      if (!child.hidden) shown = true
    }
    section.hidden = !shown
    if (shown) found = true
  })
  return found
}

export default function SettingsView({ version }: { version: string }) {
  const book = useStore(s => s.book)
  const t = useT()
  const [tab, setTab] = useState<Tab>(() => (useStore.getState().settingsTab as Tab | null) ?? 'appearance')
  const close = () => useStore.setState({ showSettings: false, settingsTab: null })
  const [query, setQuery] = useState('')
  const [nothing, setNothing] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const searching = !!query.trim()
  // The rows are drawn by each tab, with their conditions: searching reads what is really there.
  useLayoutEffect(() => { if (bodyRef.current) setNothing(!filterSettings(bodyRef.current, query)) })
  const tabs: [Tab, string, typeof Palette][] = [
    ['appearance', 'Appearance', Palette],
    ['manuscript', 'Manuscript', Type],
    ['writing', 'Writing', PenLine],
    ...(book ? [['voice', 'Voice', Feather] as [Tab, string, typeof Palette]] : []),
    ['claude', 'Claude', Bot],
    ...(book ? [['book', 'This book', BookMarked] as [Tab, string, typeof Palette]] : []),
    ['about', 'About', Info],
  ]

  return (
    <Dialog wide title={t('Settings')} icon={Gear} onClose={close} className="pl-settings-dialog"
      footer={<button type="button" className="sk-btn sk-btn-primary" onClick={close}>{t('Close')}</button>}>
      <div className="pl-settings">
        <nav className="pl-settings-nav" aria-label={t('Settings')}>
          <input type="search" autoFocus className="sk-input pl-settings-search" value={query} placeholder={t('Find a setting')} aria-label={t('Find a setting')} onChange={e => setQuery(e.target.value)} />
          {tabs.map(([id, label, Icon]) => (
            <button key={id} type="button" aria-pressed={tab === id && !searching} onClick={() => { setTab(id); setQuery('') }}>
              <Icon size={15} /> {t(label)}
            </button>
          ))}
        </nav>
        <div className="pl-settings-body" ref={bodyRef}>
          {searching && nothing && <p className="sk-hint pl-settings-none">{t('No setting matches “{query}”.', { query: query.trim() })}</p>}
          {(searching || tab === 'appearance') && <AppearanceTab />}
          {(searching || tab === 'manuscript') && (
            <SettingsSection title={t('Manuscript')} description={t('How the manuscript looks on this computer. The quick ones are also in the View menu above the page.')}>
              <ManuscriptOptions full />
            </SettingsSection>
          )}
          {(searching || tab === 'writing') && <WritingTab />}
          {(searching || tab === 'voice') && book && <VoiceSettings />}
          {(searching || tab === 'claude') && <ClaudeTab />}
          {(searching || tab === 'book') && book && <BookTab />}
          {(searching || tab === 'about') && (
            <SettingsSection title={t('About')}>
              <dl className="sk-about">
                <dt>Plume</dt><dd>{version ? `v${version}` : '-'}</dd>
                {book && <><dt>{t('Book')}</dt><dd>{book.root}</dd></>}
                <dt>{t('Design')}</dt><dd>{t('After NEO by Hugh Howey (MIT)')}</dd>
              </dl>
            </SettingsSection>
          )}
        </div>
      </div>
    </Dialog>
  )
}

function AppearanceTab() {
  const prefs = useStore(s => s.prefs)
  const setPrefs = useStore(s => s.setPrefs)
  const t = useT()
  return (
    <SettingsSection title={t('Appearance')}>
      <SettingRow label={t('Theme')} description={t('Auto follows the Windows setting')}><ThemePicker /></SettingRow>
      <SettingRow label={t('Interface language')} description={t('Menus and buttons; each book keeps its own language')}>
        <div className="sk-segmented" role="group" aria-label={t('Interface language')}>
          <button type="button" aria-pressed={prefs.ui === 'fr'} onClick={() => setPrefs({ ui: 'fr' })}>Français</button>
          <button type="button" aria-pressed={prefs.ui === 'en'} onClick={() => setPrefs({ ui: 'en' })}>English</button>
        </div>
      </SettingRow>
    </SettingsSection>
  )
}

function WritingTab() {
  const prefs = useStore(s => s.prefs)
  const setPrefs = useStore(s => s.setPrefs)
  const t = useT()
  return (
    <>
    <SettingsSection title={t('Writing')}>
      <SettingRow label={t('Show everything')} description={t('Every tab and report: the Plan’s grid and analysis, the bible’s table, gallery and analysis, and all the Review reports. Off, Plume shows what most writers use.')}>
        <Switch checked={!prefs.simple} onChange={v => setPrefs({ simple: !v })} label={t('Show everything')} />
      </SettingRow>
      <SettingRow label={t('Focus mode')} description={t('The controls fade while you type and come back when the mouse moves')}>
        <Switch checked={prefs.focus} onChange={v => setPrefs({ focus: v })} label={t('Focus mode')} />
      </SettingRow>
      <SettingRow label={t('Enter, Enter, Enter')} description={t('At the end of a scene, Enter twice starts a new scene, three times a new chapter')}>
        <Switch checked={prefs.enterBreaks} onChange={v => setPrefs({ enterBreaks: v })} label={t('Enter, Enter, Enter')} />
      </SettingRow>
      <SettingRow label={t('Bar on selected text')} description={t('Rewrite, Shorten, Expand, Show it, Comment and Synonyms above any selection.')}>
        <Switch checked={prefs.selBar} onChange={v => setPrefs({ selBar: v })} label={t('Bar on selected text')} />
      </SettingRow>
      <SettingRow label={t('Automatic capitals')} description={t('A sentence’s first letter, and the English “I”, are capitalised as you type. Ctrl+Z right after gives back what you typed.')}>
        <Switch checked={prefs.autoCapital} onChange={v => setPrefs({ autoCapital: v })} label={t('Automatic capitals')} />
      </SettingRow>
      <SettingRow label={t('Typewriter scrolling')} description={t('The line you are writing stays in the middle of the screen, so your eyes stay still.')}>
        <Switch checked={prefs.typewriter} onChange={v => setPrefs({ typewriter: v })} label={t('Typewriter scrolling')} />
      </SettingRow>
      <SettingRow label={t('Chapters pane')} description={t('Pinned open, or sliding in from the left edge')}>
        <Switch checked={prefs.pinLeft} onChange={v => setPrefs({ pinLeft: v })} label={t('Chapters pane')} />
      </SettingRow>
      <SettingRow label={t('Claude pane')} description={t('Pinned open, or sliding in from the right edge')}>
        <Switch checked={prefs.pinRight} onChange={v => setPrefs({ pinRight: v })} label={t('Claude pane')} />
      </SettingRow>
    </SettingsSection>
    <SpellSection />
    </>
  )
}

/** The spelling and grammar checker used in Review: Windows', LanguageTool, or none. */
function SpellSection() {
  const prefs = useStore(s => s.prefs)
  const setPrefs = useStore(s => s.setPrefs)
  const book = useStore(s => s.book)
  const t = useT()
  const [result, setResult] = useState('')
  const test = async () => {
    setResult(t('Testing…'))
    try { setResult(`✓ ${await ltTest({ server: prefs.ltServer, user: prefs.ltUser, key: prefs.ltKey })}`) } catch (e) { setResult(`✕ ${t((e as Error).message)}`) }
  }
  const publicServer = /languagetool(plus)?\.(org|com)/.test(prefs.ltServer || LT_DEFAULT)
  const words = book?.meta.dictionary ?? []
  return (
    <SettingsSection title={t('Spelling and grammar')} description={t('The manuscript: in Review mode, and while you write if you turn that on. Every other text box (bible, outline, notes, chat): a moment after you pause in it.')}>
      <SettingRow label={t('Checker')} description={t('Windows’ spellchecker only knows the languages installed in Windows, which may not be the book’s. LanguageTool always checks in the book’s language.')}>
        <select className="sk-select" value={prefs.spell} onChange={e => setPrefs({ spell: e.target.value as typeof prefs.spell })}>
          <option value="languagetool">LanguageTool</option>
          <option value="windows">{t('Windows spellchecker')}</option>
          <option value="off">{t('None')}</option>
        </select>
      </SettingRow>
      {prefs.spell === 'languagetool' && (
        <>
          <SettingRow label={t('Check while writing')} description={t('Off by default. When on, the scene’s text is sent to the server a moment after you stop typing, in Write mode too.')}>
            <Switch checked={prefs.ltLive} onChange={v => setPrefs({ ltLive: v })} label={t('Check while writing')} />
          </SettingRow>
          <SettingRow label={t('English variant')} description={t('For English books. French books use French.')}>
            <select className="sk-select" value={prefs.ltEnglish} onChange={e => setPrefs({ ltEnglish: e.target.value })}>
              <option value="en-US">English (US)</option><option value="en-GB">English (UK)</option>
              <option value="en-CA">English (Canada)</option><option value="en-AU">English (Australia)</option>
            </select>
          </SettingRow>
          <details className="pl-advanced pl-advconn">
            <summary>{t('Advanced connections')} <span className="sk-hint">{t('server, Premium account, test')}</span></summary>
            <SettingRow label={t('LanguageTool server')} description={publicServer ? t('The public server: free, about 20 checks a minute, and the scene’s text is sent to it. A server running on your own computer keeps everything private.') : t('Your own server.')}>
              <input className="sk-input pl-wide" value={prefs.ltServer} placeholder={LT_DEFAULT} onChange={e => setPrefs({ ltServer: e.target.value })} />
            </SettingRow>
            <SettingRow label={t('Premium account')} description={t('Optional: your LanguageTool Premium login and API key.')}>
              <span className="pl-row">
                <input className="sk-input" value={prefs.ltUser} placeholder={t('Login')} onChange={e => setPrefs({ ltUser: e.target.value })} />
                <input className="sk-input" type="password" value={prefs.ltKey} placeholder={t('API key')} onChange={e => setPrefs({ ltKey: e.target.value })} />
              </span>
            </SettingRow>
            <SettingRow label={t('Test the connection')} description={result}>
              <button type="button" className="sk-btn sk-btn-sm" onClick={test}>{t('Test')}</button>
            </SettingRow>
          </details>
        </>
      )}
      {book && words.length > 0 && (
        <SettingRow label={t('This book’s dictionary')} description={words.join(', ')}>
          <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => useStore.getState().updateMeta({ dictionary: [], ltIgnored: [] })}>{t('Clear')}</button>
        </SettingRow>
      )}
    </SettingsSection>
  )
}

function ClaudeTab() {
  const settings = useStore(s => s.settings)
  const prefs = useStore(s => s.prefs)
  const setPrefs = useStore(s => s.setPrefs)
  const exe = useStore(s => s.claudeExe)
  const [path, setPath] = useState(settings.claudePath)
  const t = useT()
  const save = () => useStore.getState().setSettings({ claudePath: path.trim() })
  return (
    <>
    <SettingsSection title="Claude" description={t('Plume uses the claude command line, signed in with your subscription.')}>
      <SettingRow label={t('Command line')} description={exe === undefined ? t('Looking…') : exe ? t('Found: {path}', { path: exe }) : t('Not found. Install Claude Code, or set the path to claude.exe.')}>
        <div className="pl-row">
          <input className="sk-input pl-wide" placeholder={t('Automatic')} value={path} onChange={e => setPath(e.target.value)} onBlur={save} />
          <button type="button" className="sk-btn sk-btn-sm" onClick={save}>{t('Detect')}</button>
        </div>
      </SettingRow>
      <SettingRow label={t('Cheap mode')} description={t('Past this share of your 5-hour limit, every call uses Haiku with low effort and a shorter context. 0 = off.')}>
        <span className="pl-row">
          <input className="sk-input pl-num" type="number" min={0} max={100} step={5} value={prefs.cheapAt} onChange={e => setPrefs({ cheapAt: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
          <span>%</span>
        </span>
      </SettingRow>
    </SettingsSection>
    <RolesSection />
    <SettingsSection title={t('Story memory')}>
      <SettingRow label={t('Keep the story memory up to date')} description={t('When you leave a scene you changed, a small job summarises it, then its chapter. Claude reads these summaries to know what already happened in the book.')}>
        <Switch checked={prefs.memory} onChange={v => setPrefs({ memory: v })} label={t('Keep the story memory up to date')} />
      </SettingRow>
    </SettingsSection>
    <ModelPresetsSection />
    </>
  )
}

function BookTab() {
  const book = useStore(s => s.book)!
  const t = useT()
  const ai = book.meta.ai
  const setAi = (patch: Partial<typeof ai>) => useStore.getState().updateMeta({ ai: { ...book.meta.ai, ...patch } })
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || min)))
  const goal = book.meta.goal
  const setGoal = (patch: Partial<typeof goal>) => useStore.getState().updateMeta({ goal: { ...goal, ...patch } })
  const serial = isSerial(book)
  const sr = serialOf(book)
  const setSerial = (patch: Partial<Serial>) => useStore.getState().updateMeta({ serial: { ...serialOf(useStore.getState().book!), ...patch } })
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return (
    <>
    <SettingsSection title={t('Kind of book')} description={t('A web novel is published chapter by chapter: release schedule, buffer, arcs and volumes, hooks, threads, published chapters kept as canon, and a copy for Royal Road.')}>
      <SettingRow label={t('Kind of book')}>
        <div className="sk-segmented" role="group" aria-label={t('Kind of book')}>
          <button type="button" aria-pressed={!serial} onClick={() => useStore.getState().updateMeta({ kind: undefined })}>{t('Book')}</button>
          <button type="button" aria-pressed={serial} onClick={() => useStore.getState().updateMeta({ kind: 'serial', serial: sr })}>{t('Web novel')}</button>
        </div>
      </SettingRow>
      {serial && (
        <>
          <SettingRow label={t('Release days')} description={t('One chapter on each day ticked: the buffer counts how long your written chapters last.')}>
            <div className="sk-segmented" role="group" aria-label={t('Release days')}>
              {[1, 2, 3, 4, 5, 6, 0].map(d => (
                <button key={d} type="button" aria-pressed={sr.days.includes(d)} onClick={() => setSerial({ days: sr.days.includes(d) ? sr.days.filter(x => x !== d) : [...sr.days, d].sort() })}>{t(DAYS[d])}</button>
              ))}
            </div>
          </SettingRow>
          <SettingRow label={t('LitRPG and progression')} description={t('System windows and status screens: lines starting with | (| Level: 12). Characters get stats by chapter, and boxes that disagree with them are flagged.')}>
            <Switch checked={sr.litrpg} onChange={v => setSerial({ litrpg: v })} label={t('LitRPG and progression')} />
          </SettingRow>
          <SettingRow label={t('Thread alert')} description={t('An open thread untouched for this many chapters is flagged (Plan → Threads).')}>
            <input className="sk-input pl-num" type="number" min={2} max={100} value={sr.threadGap} onChange={e => setSerial({ threadGap: num(e.target.value, 2, 100) })} />
          </SettingRow>
        </>
      )}
    </SettingsSection>
    <SettingsSection title={t('Goals')}>
      <SettingRow label={t('Words for the whole book')}>
        <input className="sk-input pl-num" type="number" min={0} step={5000} value={goal.book} onChange={e => setGoal({ book: Math.max(0, Number(e.target.value) || 0) })} />
      </SettingRow>
      <SettingRow label={t('Usual chapter length')} description={t('A guide for Claude when it writes from the plan, shared between the chapter’s scenes. It may write shorter or longer when the scene needs it.')}>
        <span className="pl-row">
          <input className="sk-input pl-num" type="number" min={500} step={250} value={ai.chapterWords[0]} onChange={e => setAi({ chapterWords: [num(e.target.value, 500, 20000), Math.max(num(e.target.value, 500, 20000), ai.chapterWords[1])] })} aria-label={t('At least')} />
          <span>–</span>
          <input className="sk-input pl-num" type="number" min={500} step={250} value={ai.chapterWords[1]} onChange={e => setAi({ chapterWords: [Math.min(ai.chapterWords[0], num(e.target.value, 500, 20000)), num(e.target.value, 500, 20000)] })} aria-label={t('At most')} />
          <span>{t('words')}</span>
        </span>
      </SettingRow>
      <SettingRow label={t('How you plan')} description={t('Your own way of planning, in your own words (“chapters end on a cliffhanger”, “two points of view that alternate”). It goes with every planning request and wins over Plume’s rules.')}>
        <textarea className="sk-input" rows={3} value={ai.planStyle ?? ''} onChange={e => setAi({ planStyle: e.target.value })} />
      </SettingRow>
      <SettingRow label={t('Words a day')}>
        <input className="sk-input pl-num" type="number" min={0} step={100} value={goal.daily} onChange={e => setGoal({ daily: Math.max(0, Number(e.target.value) || 0) })} />
      </SettingRow>
    </SettingsSection>
    <SettingsSection title={t('Front and back matter')} description={serial
      ? t('Printed around the chapters when you export the book or a volume as a book (Export → Chapters). One paragraph per line; empty pages are left out.')
      : t('Printed around the chapters in every export and in Page view of the whole book. One paragraph per line; empty pages are left out. A part page goes before a chapter (Plan → Board).')}>
      {[...FRONT, ...BACK].map((k: MatterKey) => (
        <div key={k} className="pl-matter">
          <span className="sk-label">{MATTER_LABEL[k][book.meta.language]}</span>
          <textarea className="sk-input" rows={k === 'dedication' ? 2 : 4} value={book.meta.matter?.[k] ?? ''}
            onChange={e => useStore.getState().updateMeta({ matter: { ...useStore.getState().book!.meta.matter, [k]: e.target.value } })} />
        </div>
      ))}
    </SettingsSection>
    <SeriesSection />
    <BackupSection />
    <SettingsSection title={t('This book')} description={t("Saved in the book's plume.json.")}>
      <SettingRow label={t('Cover')} description={book.meta.cover ? book.meta.cover : t('A picture put at the front of the EPUB. Stores ask for 1600 × 2560 pixels or more.')}>
        <span className="pl-row">
          <button type="button" className="sk-btn sk-btn-sm" onClick={async () => { const rel = await pickImage(book.root, 'images/cover', t('Choose the cover')); if (rel) useStore.getState().updateMeta({ cover: rel }) }}>{book.meta.cover ? t('Change…') : t('Choose…')}</button>
          {book.meta.cover && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => useStore.getState().updateMeta({ cover: undefined })}>{t('Remove')}</button>}
        </span>
      </SettingRow>
      <SettingRow label={t('Language of the book')} description={t('Chapter headings, typography (« » and spaces in French), the spellcheck dictionary and the language Claude writes in')}>
        <div className="sk-segmented" role="group" aria-label={t('Language of the book')}>
          <button type="button" aria-pressed={book.meta.language === 'fr'} onClick={() => useStore.getState().updateMeta({ language: 'fr' })}>Français</button>
          <button type="button" aria-pressed={book.meta.language === 'en'} onClick={() => useStore.getState().updateMeta({ language: 'en' })}>English</button>
        </div>
      </SettingRow>
    </SettingsSection>
    <SettingsSection title={t('AI for this book')}>
      <p className="sk-hint">{t('The model is chosen under the Assistant and under the Chat (which AI, then which model).')}</p>
      <SettingRow label={t('Bible budget')} description={t('Most tokens of bible entries sent per request')}>
        <input className="sk-input pl-num" type="number" min={500} max={20000} step={500} value={ai.bibleBudget} onChange={e => setAi({ bibleBudget: num(e.target.value, 500, 20000) })} />
      </SettingRow>
      <SettingRow label={t('Story window')} description={t('Words before the cursor sent as context')}>
        <input className="sk-input pl-num" type="number" min={200} max={10000} step={100} value={ai.storyWindow} onChange={e => setAi({ storyWindow: num(e.target.value, 200, 10000) })} />
      </SettingRow>
      <SettingRow label={t('Continue length')} description={t('Words asked for by Continue')}>
        <input className="sk-input pl-num" type="number" min={50} max={2000} step={50} value={ai.continueWords} onChange={e => setAi({ continueWords: num(e.target.value, 50, 2000) })} />
      </SettingRow>
      <SettingRow label={t('Beats length')} description={t('Words asked for by Beats to prose')}>
        <input className="sk-input pl-num" type="number" min={100} max={4000} step={100} value={ai.beatsWords} onChange={e => setAi({ beatsWords: num(e.target.value, 100, 4000) })} />
      </SettingRow>
    </SettingsSection>
    </>
  )
}

/** A series: books that share a bible folder; facts can be dated per book ([b2 ch 3+]). */
function SeriesSection() {
  const book = useStore(s => s.book)!
  const t = useT()
  const s = book.meta.series
  const choose = async () => {
    const dir = await openDialog({ directory: true, title: t('Choose or create the series folder') })
    if (typeof dir === 'string') await joinSeries(book, dir, s?.index ?? 1)
  }
  return (
    <SettingsSection title={t('Series')} description={t('Books of a series share a bible folder. Facts can be dated per book: [b2 ch 3+].')}>
      <SettingRow label={t('Series folder')} description={s ? seriesName(book) : t('Not in a series')}>
        <div className="pl-row">
          <button type="button" className="sk-btn sk-btn-sm" onClick={choose}>{s ? t('Change…') : t('Choose…')}</button>
          {s && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => useStore.getState().updateMeta({ series: null })}>{t('Leave the series')}</button>}
        </div>
      </SettingRow>
      {s && (
        <SettingRow label={t('Book number in the series')}>
          <input className="sk-input pl-num" type="number" min={1} value={s.index} onChange={e => useStore.getState().updateMeta({ series: { ...s, index: Math.max(1, Number(e.target.value) || 1) } })} />
        </SettingRow>
      )}
    </SettingsSection>
  )
}

/** Daily zips of the book: the last ten, then one a week for half a year, on top of autosave. */
function BackupSection() {
  const book = useStore(s => s.book)!
  const t = useT()
  const [list, setList] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => { listBackups(book).then(setList).catch(() => setList([])) }, [book])
  const now = async () => {
    setBusy(true)
    try { const p = await backupNow(book); setList(await listBackups(book)); useStore.getState().notify('ok', t('Backed up: {path}', { path: p })) } catch (e) { useStore.getState().notify('error', String(e)) }
    setBusy(false)
  }
  return (
    <SettingsSection title={t('Backups')} description={t('A zip of the whole book once a day when you open it, in Plume’s own folder on this computer. The last ten are kept, then one a week for half a year.')}>
      <SettingRow label={t('Back up now')} description={list[0] ?? t('No backup yet')}>
        <button type="button" className="sk-btn sk-btn-sm" disabled={busy} onClick={now}>{busy ? t('Backing up…') : t('Back up now')}</button>
      </SettingRow>
      {list.length > 1 && <p className="sk-hint">{t('{n} backups kept.', { n: list.length })}</p>}
    </SettingsSection>
  )
}
