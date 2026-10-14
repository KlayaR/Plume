// Model presets and OpenRouter: Settings → Claude (the key, when OpenRouter
// takes over, the presets), a searchable picker for OpenRouter's hundreds of
// models, and the one-line preset choice used in the AI panel and the book's
// AI settings.
import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { Dialog, SettingRow, SettingsSection } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { CLAUDE_MODELS, DEFAULT_PRESETS, presetFor, searchModels, type Fallback, type ModelInfo, type Preset } from '../lib/presets'
import type { ActionSettings, Effort, Model } from '../lib/types'
import { openRouterModels, testOpenRouterKey } from '../llm'
import { newId } from '../lib/text'
import { numLocale, useT } from '../i18n'

/** One dropdown with the presets, instead of a model list and an effort list. */
export function PresetSelect({ value, onChange }: { value: ActionSettings; onChange: (next: ActionSettings) => void }) {
  const presets = useStore(s => s.prefs.presets)
  const t = useT()
  const current = presetFor(value, presets)
  const pick = (id: string) => {
    const p = presets.find(x => x.id === id)
    if (!p) return
    onChange(p.backend === 'claude' ? { ...value, model: p.model as Model, effort: p.effort, preset: p.id } : { ...value, preset: p.id })
  }
  return (
    <select className="sk-select sk-btn-sm" value={current?.id ?? 'custom'} onChange={e => pick(e.target.value)} aria-label={t('Model')} title={t('Model presets are set in Settings → Claude')}>
      {!current && <option value="custom">{value.model} · {value.effort}</option>}
      {presets.map(p => <option key={p.id} value={p.id}>{p.name}{p.backend === 'openrouter' ? ' · OpenRouter' : ''}</option>)}
    </select>
  )
}

/** Search OpenRouter's models and pick one. */
export function ModelPicker({ onPick, onClose }: { onPick: (m: ModelInfo) => void; onClose: () => void }) {
  const t = useT()
  const [list, setList] = useState<ModelInfo[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => { openRouterModels().then(setList).catch(e => setError((e as Error).message)) }, [])
  const shown = useMemo(() => searchModels(list ?? [], query).slice(0, 80), [list, query])
  const price = (x: number) => x === 0 ? t('free') : `$${x < 1 ? x.toFixed(2) : x.toFixed(1)}`
  return (
    <Dialog wide title={t('Pick an OpenRouter model')} icon={Search} onClose={onClose} footer={<button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Close')}</button>}>
      <div className="pl-find">
        <input className="sk-input" autoFocus value={query} placeholder={t('Search by name: claude, deepseek, llama, gemini…')} onChange={e => setQuery(e.target.value)} />
        {error && <span className="sk-hint pl-warn">{error}</span>}
        {!list && !error && <span className="sk-hint">{t('Loading the list…')}</span>}
        {list && <span className="sk-hint">{t('{n} models. Prices are per million tokens (in / out).', { n: list.length.toLocaleString(numLocale()) })}</span>}
        <div className="pl-find-list">
          {shown.map(m => (
            <button key={m.id} type="button" className="pl-find-main pl-model-row" onClick={() => onPick(m)}>
              <span className="pl-find-where">{m.name}</span>
              <span className="pl-find-ctx">{m.id} · {m.context ? `${Math.round(m.context / 1000)}k` : '?'} {t('context')} · {price(m.promptPrice)} / {price(m.completionPrice)}</span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  )
}

/**
 * The brainstorm chat's two choices: which backend answers (the claude command
 * line or OpenRouter), then which model. OpenRouter's list is your saved models
 * plus a search of all of them.
 */
export function BackendModelSelect() {
  const prefs = useStore(s => s.prefs)
  const setPrefs = useStore(s => s.setPrefs)
  const t = useT()
  const [picking, setPicking] = useState(false)
  const saved = [...new Set([...prefs.presets.filter(p => p.backend === 'openrouter').map(p => p.model), ...(prefs.chatBackend === 'openrouter' && prefs.chatModel ? [prefs.chatModel] : [])])]
  const nameOf = (id: string) => prefs.presets.find(p => p.backend === 'openrouter' && p.model === id)?.name ?? id
  const setBackend = (b: 'claude' | 'openrouter') => setPrefs(b === 'claude'
    ? { chatBackend: 'claude', chatModel: CLAUDE_MODELS.includes(prefs.chatModel as Model) ? prefs.chatModel : 'sonnet' }
    : { chatBackend: 'openrouter', chatModel: saved[0] ?? '' })
  const pick = (m: ModelInfo) => {
    if (!prefs.presets.some(p => p.backend === 'openrouter' && p.model === m.id)) setPrefs({ presets: [...prefs.presets, { id: newId(), name: m.name, backend: 'openrouter', model: m.id, effort: 'low' }] })
    setPrefs({ chatBackend: 'openrouter', chatModel: m.id })
    setPicking(false)
  }
  return (
    <>
      <select className="sk-select sk-btn-sm" value={prefs.chatBackend} aria-label={t('Which AI answers')} onChange={e => setBackend(e.target.value as 'claude' | 'openrouter')}>
        <option value="claude">{t('Claude (command line)')}</option>
        <option value="openrouter">OpenRouter</option>
      </select>
      {prefs.chatBackend === 'claude'
        ? (
          <select className="sk-select sk-btn-sm" value={prefs.chatModel} aria-label={t('Model')} onChange={e => setPrefs({ chatModel: e.target.value })}>
            {CLAUDE_MODELS.map(m => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
          </select>
        )
        : (
          <select className="sk-select sk-btn-sm" value={prefs.chatModel} aria-label={t('Model')}
            onChange={e => e.target.value === '@search' ? setPicking(true) : setPrefs({ chatModel: e.target.value })}>
            {!prefs.chatModel && <option value="">{t('Pick a model…')}</option>}
            {saved.map(id => <option key={id} value={id}>{nameOf(id)}</option>)}
            <option value="@search">{t('Search all models…')}</option>
          </select>
        )}
      {prefs.chatBackend === 'openrouter' && !prefs.orKey && <span className="sk-hint pl-warn">{t('Add your OpenRouter key in Settings → Claude.')}</span>}
      {picking && <ModelPicker onPick={pick} onClose={() => setPicking(false)} />}
    </>
  )
}

/** Settings → Claude: OpenRouter, and the presets. */
export function ModelPresetsSection() {
  const prefs = useStore(s => s.prefs)
  const setPrefs = useStore(s => s.setPrefs)
  const t = useT()
  const [key, setKey] = useState(prefs.orKey)
  const [result, setResult] = useState('')
  const [picking, setPicking] = useState<string | null>(null)
  const orPresets = prefs.presets.filter(p => p.backend === 'openrouter')
  const setPresets = (presets: Preset[]) => setPrefs({ presets })
  const patch = (id: string, p: Partial<Preset>) => setPresets(prefs.presets.map(x => x.id === id ? { ...x, ...p } : x))
  const test = async () => {
    setResult(t('Testing…'))
    try { setResult(`✓ ${await testOpenRouterKey(key.trim())}`) } catch (e) { setResult(`✕ ${(e as Error).message}`) }
  }
  const addClaude = () => setPresets([...prefs.presets, { id: newId(), name: t('New preset'), backend: 'claude', model: 'sonnet', effort: 'low' }])
  const add = (m: ModelInfo) => {
    const existing = prefs.presets.find(p => p.id === picking)
    const id = existing?.id ?? newId()
    if (existing) patch(id, { model: m.id })
    else setPresets([...prefs.presets, { id, name: m.name, backend: 'openrouter', model: m.id, effort: 'low' }])
    // The first OpenRouter preset becomes the fallback by default.
    if (!prefs.fallbackPreset) setPrefs({ fallbackPreset: id })
    setPicking(null)
  }
  const modes: [Fallback, string][] = [['off', 'Never'], ['auto', 'When Claude runs out'], ['always', 'Always']]

  return (
    <>
      <SettingsSection title="OpenRouter" description={t('Other models through OpenRouter: use them on their own, or keep writing when your Claude plan runs out. You pay OpenRouter for what you use.')}>
        <SettingRow label={t('API key')} description={t('From openrouter.ai/keys. Kept on this computer only, never in a book.')}>
          <span className="pl-row">
            <input className="sk-input pl-wide" type="password" value={key} placeholder="sk-or-…" onChange={e => { setKey(e.target.value); setPrefs({ orKey: e.target.value.trim() }) }} />
            <button type="button" className="sk-btn sk-btn-sm" disabled={!key.trim()} onClick={test}>{t('Test')}</button>
          </span>
        </SettingRow>
        {result && <p className="sk-hint">{result}</p>}
        <SettingRow label={t('Use OpenRouter')} description={prefs.fallback === 'auto' ? t('When the Claude command line says the plan’s usage is used up, the request is repeated on the fallback model below.') : prefs.fallback === 'always' ? t('Every request goes to the fallback model below, even when Claude is available.') : t('Only presets that are marked OpenRouter use it.')}>
          <div className="sk-segmented" role="group" aria-label={t('Use OpenRouter')}>
            {modes.map(([id, label]) => <button key={id} type="button" aria-pressed={prefs.fallback === id} onClick={() => setPrefs({ fallback: id })}>{t(label)}</button>)}
          </div>
        </SettingRow>
        <SettingRow label={t('Fallback model')} description={orPresets.length ? t('Used for “When Claude runs out” and “Always”. Agent tasks that read files still need Claude.') : t('Add an OpenRouter preset below first.')}>
          <select className="sk-select" value={prefs.fallbackPreset} disabled={!orPresets.length} onChange={e => setPrefs({ fallbackPreset: e.target.value })}>
            <option value="">{t('None')}</option>
            {orPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('Model presets')} description={t('A preset is a named choice of model and effort. Pick them in the AI panel and in Settings → This book instead of scrolling a list.')}>
        {prefs.presets.map(p => (
          <div key={p.id} className="pl-preset">
            <input className="sk-input" value={p.name} aria-label={t('Name')} onChange={e => patch(p.id, { name: e.target.value })} />
            {p.backend === 'claude'
              ? (
                <>
                  <select className="sk-select" value={p.model} aria-label={t('Model')} onChange={e => patch(p.id, { model: e.target.value })}>
                    {CLAUDE_MODELS.map(m => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
                  </select>
                  <select className="sk-select" value={p.effort} aria-label={t('Effort')} onChange={e => patch(p.id, { effort: e.target.value as Effort })}>
                    <option value="low">{t('Low effort')}</option><option value="medium">{t('Medium effort')}</option><option value="high">{t('High effort')}</option>
                  </select>
                </>
              )
              : (
                <>
                  <button type="button" className="sk-btn pl-preset-model" onClick={() => setPicking(p.id)} title={p.model}>{p.model}</button>
                  <span className="sk-badge">OpenRouter</span>
                </>
              )}
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" aria-label={t('Delete')} disabled={prefs.presets.length < 2}
              onClick={() => { setPresets(prefs.presets.filter(x => x.id !== p.id)); if (prefs.fallbackPreset === p.id) setPrefs({ fallbackPreset: '' }) }}><Trash2 size={13} /></button>
          </div>
        ))}
        <div className="pl-row">
          <button type="button" className="sk-btn sk-btn-sm" onClick={addClaude}><Plus size={13} /> {t('Claude preset')}</button>
          <button type="button" className="sk-btn sk-btn-sm" onClick={() => setPicking('')}><Plus size={13} /> {t('OpenRouter model…')}</button>
          <span className="pl-grow" />
          <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setPresets(DEFAULT_PRESETS)}>{t('Restore the three default presets')}</button>
        </div>
      </SettingsSection>
      {picking !== null && <ModelPicker onPick={add} onClose={() => setPicking(null)} />}
    </>
  )
}
