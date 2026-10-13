// Settings, as tabs on the left: Appearance, Manuscript, Writing, Claude,
// This book (when one is open), About.
import { useState } from 'react'
import { BookMarked, Bot, Info, Palette, PenLine, Type, Settings as Gear } from 'lucide-react'
import { Dialog, SettingRow, SettingsSection, Switch, ThemePicker } from '../studio-kit/shell.js'
import { useStore } from '../store'
import type { ActionId, Effort, Model } from '../lib/types'
import { useT } from '../i18n'
import ManuscriptOptions from './ManuscriptOptions'

const ACTIONS: [ActionId, string][] = [['continue', 'Continue'], ['rewrite', 'Rewrite selection'], ['beats', 'Beats to prose']]
type Tab = 'appearance' | 'manuscript' | 'writing' | 'claude' | 'book' | 'about'

export default function SettingsView({ version }: { version: string }) {
  const book = useStore(s => s.book)
  const t = useT()
  const [tab, setTab] = useState<Tab>('appearance')
  const close = () => useStore.setState({ showSettings: false })
  const tabs: [Tab, string, typeof Palette][] = [
    ['appearance', 'Appearance', Palette],
    ['manuscript', 'Manuscript', Type],
    ['writing', 'Writing', PenLine],
    ['claude', 'Claude', Bot],
    ...(book ? [['book', 'This book', BookMarked] as [Tab, string, typeof Palette]] : []),
    ['about', 'About', Info],
  ]

  return (
    <Dialog wide title={t('Settings')} icon={Gear} onClose={close} className="pl-settings-dialog"
      footer={<button type="button" className="sk-btn sk-btn-primary" onClick={close}>{t('Close')}</button>}>
      <div className="pl-settings">
        <nav className="pl-settings-nav" aria-label={t('Settings')}>
          {tabs.map(([id, label, Icon]) => (
            <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
              <Icon size={15} /> {t(label)}
            </button>
          ))}
        </nav>
        <div className="pl-settings-body">
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'manuscript' && (
            <SettingsSection title={t('Manuscript')} description={t('How the manuscript looks on this computer. The quick ones are also under Aa in the bottom bar.')}>
              <ManuscriptOptions full />
            </SettingsSection>
          )}
          {tab === 'writing' && <WritingTab />}
          {tab === 'claude' && <ClaudeTab />}
          {tab === 'book' && book && <BookTab />}
          {tab === 'about' && (
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
    <SettingsSection title={t('Writing')}>
      <SettingRow label={t('Focus mode')} description={t('The controls fade while you type and come back when the mouse moves')}>
        <Switch checked={prefs.focus} onChange={v => setPrefs({ focus: v })} label={t('Focus mode')} />
      </SettingRow>
      <SettingRow label={t('Enter, Enter, Enter')} description={t('At the end of a scene, Enter twice starts a new scene, three times a new chapter')}>
        <Switch checked={prefs.enterBreaks} onChange={v => setPrefs({ enterBreaks: v })} label={t('Enter, Enter, Enter')} />
      </SettingRow>
      <SettingRow label={t('Chapters pane')} description={t('Pinned open, or sliding in from the left edge')}>
        <Switch checked={prefs.pinLeft} onChange={v => setPrefs({ pinLeft: v })} label={t('Chapters pane')} />
      </SettingRow>
      <SettingRow label={t('Claude pane')} description={t('Pinned open, or sliding in from the right edge')}>
        <Switch checked={prefs.pinRight} onChange={v => setPrefs({ pinRight: v })} label={t('Claude pane')} />
      </SettingRow>
    </SettingsSection>
  )
}

function ClaudeTab() {
  const settings = useStore(s => s.settings)
  const exe = useStore(s => s.claudeExe)
  const [path, setPath] = useState(settings.claudePath)
  const t = useT()
  const save = () => useStore.getState().setSettings({ claudePath: path.trim() })
  return (
    <SettingsSection title="Claude" description={t('Plume uses the claude command line, signed in with your subscription.')}>
      <SettingRow label={t('Command line')} description={exe === undefined ? t('Looking…') : exe ? t('Found: {path}', { path: exe }) : t('Not found. Install Claude Code, or set the path to claude.exe.')}>
        <div className="pl-row">
          <input className="sk-input pl-wide" placeholder={t('Automatic')} value={path} onChange={e => setPath(e.target.value)} onBlur={save} />
          <button type="button" className="sk-btn sk-btn-sm" onClick={save}>{t('Detect')}</button>
        </div>
      </SettingRow>
    </SettingsSection>
  )
}

function BookTab() {
  const book = useStore(s => s.book)!
  const t = useT()
  const ai = book.meta.ai
  const setAi = (patch: Partial<typeof ai>) => useStore.getState().updateMeta({ ai: { ...book.meta.ai, ...patch } })
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || min)))
  return (
    <>
    <SettingsSection title={t('This book')} description={t("Saved in the book's plume.json.")}>
      <SettingRow label={t('Language of the book')} description={t('Chapter headings, typography (« » and spaces in French), the spellcheck dictionary and the language Claude writes in')}>
        <div className="sk-segmented" role="group" aria-label={t('Language of the book')}>
          <button type="button" aria-pressed={book.meta.language === 'fr'} onClick={() => useStore.getState().updateMeta({ language: 'fr' })}>Français</button>
          <button type="button" aria-pressed={book.meta.language === 'en'} onClick={() => useStore.getState().updateMeta({ language: 'en' })}>English</button>
        </div>
      </SettingRow>
    </SettingsSection>
    <SettingsSection title={t('AI for this book')}>
      {ACTIONS.map(([id, label]) => (
        <SettingRow key={id} label={t(label)}>
          <div className="pl-row">
            <select className="sk-select" value={ai.actions[id].model} onChange={e => setAi({ actions: { ...ai.actions, [id]: { ...ai.actions[id], model: e.target.value as Model } } })}>
              <option value="haiku">Haiku</option><option value="sonnet">Sonnet</option><option value="opus">Opus</option>
            </select>
            <select className="sk-select" value={ai.actions[id].effort} onChange={e => setAi({ actions: { ...ai.actions, [id]: { ...ai.actions[id], effort: e.target.value as Effort } } })}>
              <option value="low">{t('Low effort')}</option><option value="medium">{t('Medium effort')}</option><option value="high">{t('High effort')}</option>
            </select>
          </div>
        </SettingRow>
      ))}
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
