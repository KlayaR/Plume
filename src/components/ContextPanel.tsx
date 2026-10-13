// Right panel: the three AI actions, the size meter, and the bible entries
// that will be sent, each droppable or switchable between short and full.
import { useMemo, useState } from 'react'
import { Check, Eye, RotateCcw, Send, Square, X } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import type { ActionId, Effort, Model } from '../lib/types'
import type { Override } from '../lib/context'
import { accept, currentContext, discard, retry, runAction, stopAction, useAI } from '../editor/actions'
import { numLocale, useT } from '../i18n'

/** Reasons come from the context engine in English; shown in the interface language. */
function reasonText(r: string, t: ReturnType<typeof useT>) {
  const m = /^mentioned (\d+)×$/.exec(r)
  if (m) return t('mentioned {n}×', { n: m[1] })
  if (r.startsWith('linked from ')) return t('linked from {name}', { name: r.slice(12) })
  return t(r)
}

const LABELS: Record<ActionId, { tab: string; button: string; hint: string }> = {
  continue: { tab: 'Continue', button: 'Continue', hint: 'Optional direction, e.g. "she refuses, coldly"' },
  rewrite: { tab: 'Rewrite', button: 'Rewrite selection', hint: 'How to rewrite, e.g. "tighter, more tension"' },
  beats: { tab: 'Beats', button: 'Write from beats', hint: 'One beat per line' },
}

const n = (x: number) => x.toLocaleString(numLocale())

export default function ContextPanel() {
  const book = useStore(s => s.book)!
  const tick = useStore(s => s.editorTick)
  const running = useAI(s => s.running)
  const hasProposal = useAI(s => s.hasProposal)
  const [action, setAction] = useState<ActionId>('continue')
  const [text, setText] = useState<Record<ActionId, string>>({ continue: '', rewrite: '', beats: '' })
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [preview, setPreview] = useState(false)
  const instruction = text[action]
  const t = useT()

  const ctx = useMemo(
    () => currentContext(action, instruction, overrides),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book, tick, action, instruction, overrides],
  )

  const settings = book.meta.ai.actions[action]
  const setSetting = (patch: Partial<typeof settings>) =>
    useStore.getState().updateMeta({ ai: { ...book.meta.ai, actions: { ...book.meta.ai.actions, [action]: { ...settings, ...patch } } } })
  const setOverride = (slug: string, o: Override | null) =>
    setOverrides(prev => { const next = { ...prev }; if (o) next[slug] = o; else delete next[slug]; return next })

  const total = ctx ? ctx.total : 0
  const seg = (v: number) => `${total ? (v / total) * 100 : 0}%`
  const bibleOver = ctx ? ctx.parts.bible > ctx.budget : false

  return (
    <aside className="pl-context">
      <div className="sk-segmented pl-actions" role="group" aria-label={t('AI action')}>
        {(Object.keys(LABELS) as ActionId[]).map(a => (
          <button key={a} type="button" aria-pressed={action === a} onClick={() => setAction(a)}>{t(LABELS[a].tab)}</button>
        ))}
      </div>

      <textarea
        className="sk-input pl-instruction"
        rows={action === 'beats' ? 6 : 3}
        placeholder={t(LABELS[action].hint) + ' · ' + t('@Name sends the full entry')}
        value={instruction}
        onChange={e => setText(t => ({ ...t, [action]: e.target.value }))}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runAction(action, instruction, overrides) } }}
      />

      <div className="pl-row">
        <select className="sk-select sk-btn-sm" value={settings.model} onChange={e => setSetting({ model: e.target.value as Model })} aria-label={t('Model')}>
          <option value="haiku">Haiku</option><option value="sonnet">Sonnet</option><option value="opus">Opus</option>
        </select>
        <select className="sk-select sk-btn-sm" value={settings.effort} onChange={e => setSetting({ effort: e.target.value as Effort })} aria-label={t('Effort')}>
          <option value="low">{t('Low')}</option><option value="medium">{t('Medium')}</option><option value="high">{t('High')}</option>
        </select>
      </div>
      <div className="pl-send">
        {running ? (
          <button type="button" className="sk-btn sk-btn-danger" onClick={stopAction}><Square size={14} /> {t('Stop')}</button>
        ) : (
          <button type="button" className="sk-btn sk-btn-primary" disabled={hasProposal} onClick={() => runAction(action, instruction, overrides)}>
            <Send size={14} /> {t(LABELS[action].button)}
          </button>
        )}
      </div>

      {hasProposal && !running && (
        <div className="pl-proposalbar">
          <span>{t('Proposal')}</span>
          <span className="pl-grow" />
          <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={accept} title="Tab"><Check size={14} /> {t('Accept')}</button>
          <button type="button" className="sk-btn sk-btn-sm" onClick={retry}><RotateCcw size={14} /> {t('Retry')}</button>
          <button type="button" className="sk-btn sk-btn-sm sk-btn-ghost" onClick={discard} title="Esc"><X size={14} /> {t('Discard')}</button>
        </div>
      )}

      {ctx && (
        <section className="pl-meter">
          <div className="pl-row">
            <span className="sk-label">{t('Request size')}</span>
            <span className="pl-grow" />
            <span className="sk-num" title={t('Estimate: no tokenizer is available offline')}>≈ {n(total)} {t('tokens')}</span>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" title={t('Preview the prompt')} onClick={() => setPreview(true)}><Eye size={14} /></button>
          </div>
          <div className="pl-bar-meter" aria-hidden="true">
            <span className="pl-m-rules" style={{ width: seg(ctx.parts.rules) }} />
            <span className={`pl-m-bible ${bibleOver ? 'pl-m-over' : ''}`} style={{ width: seg(ctx.parts.bible) }} />
            <span className="pl-m-story" style={{ width: seg(ctx.parts.story) }} />
            <span className="pl-m-task" style={{ width: seg(ctx.parts.task) }} />
          </div>
          <div className="pl-legend">
            <span><i className="pl-m-rules" />{t('Rules')} {n(ctx.parts.rules)}</span>
            <span><i className="pl-m-bible" />{t('Bible')} {n(ctx.parts.bible)} / {n(ctx.budget)}</span>
            <span><i className="pl-m-story" />{t('Story')} {n(ctx.parts.story)}</span>
            <span><i className="pl-m-task" />{t('Task')} {n(ctx.parts.task)}</span>
          </div>
          <p className="sk-hint">{t('The rules and bible are cached by the CLI for an hour, so repeat calls in this scene cost much less.')}</p>
        </section>
      )}

      {ctx && (
        <section className="pl-entries">
          <span className="sk-label">{t('Bible entries sent')}</span>
          {ctx.picked.length === 0 && <p className="sk-hint">{t('No bible names in the text near the cursor yet.')}</p>}
          {ctx.picked.map(p => (
            <div key={p.slug} className={`pl-entry ${p.dropped ? 'pl-dropped' : ''}`}>
              <input type="checkbox" className="sk-check" checked={!p.dropped} aria-label={t('Send {name}', { name: p.name })}
                onChange={e => setOverride(p.slug, e.target.checked ? (overrides[p.slug] === 'drop' ? null : p.mode) : 'drop')} />
              <div className="pl-entry-main">
                <div className="pl-entry-name">{p.name}</div>
                <div className="pl-entry-why">{p.reasons.map(r => reasonText(r, t)).join(' · ')}{p.budgetCut ? ' · ' + t('cut by budget') : ''}</div>
              </div>
              <div className="sk-segmented pl-mode" role="group" aria-label={t('Version')}>
                <button type="button" aria-pressed={p.mode === 'short'} disabled={p.dropped} onClick={() => setOverride(p.slug, 'short')}>S</button>
                <button type="button" aria-pressed={p.mode === 'full'} disabled={p.dropped} onClick={() => setOverride(p.slug, 'full')}>F</button>
              </div>
              <span className="sk-num pl-entry-tokens">{p.dropped ? '–' : n(p.tokens)}</span>
            </div>
          ))}
          {Object.keys(overrides).length > 0 && (
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setOverrides({})}>{t('Reset choices')}</button>
          )}
        </section>
      )}

      {preview && ctx && (
        <Dialog title={t('Prompt preview')} subtitle={`≈ ${n(total)} ${t('tokens')}`} wide onClose={() => setPreview(false)}>
          <span className="sk-label">{t('System prompt (cached)')}</span>
          <pre className="pl-pre">{ctx.system}</pre>
          <span className="sk-label">{t('Message')}</span>
          <pre className="pl-pre">{ctx.message}</pre>
        </Dialog>
      )}
    </aside>
  )
}
