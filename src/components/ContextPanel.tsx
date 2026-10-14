// Right panel: the three AI actions, the size meter, and the bible entries
// that will be sent, each droppable or switchable between short and full.
import { useMemo, useState } from 'react'
import { Check, CircleCheck, CircleX, Copy, Eye, GraduationCap, RotateCcw, Send, Square, Wand2, X } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import type { ActionId, Effort, Model } from '../lib/types'
import type { Override } from '../lib/context'
import { accept, alternatives, currentContext, discard, pickAlternative, retry, retryFixing, runAction, stopAction, useAI } from '../editor/actions'
import { diffWords, learnTaste, useNotes } from '../writing'
import { getEditorView } from '../editor/actions'
import { allPrompts } from '../lib/voice'
import { PresetSelect } from './ModelPresets'
import { isCheap } from '../ai'
import { numLocale, useT } from '../i18n'

/** Reasons come from the context engine in English; shown in the interface language. */
function reasonText(r: string, t: ReturnType<typeof useT>) {
  const m = /^mentioned (\d+)×$/.exec(r)
  if (m) return t('mentioned {n}×', { n: m[1] })
  if (r.startsWith('linked from ')) return t('linked from {name}', { name: r.slice(12) })
  return t(r)
}

type Tab = 'continue' | 'rewrite' | 'beats'
const LABELS: Record<Tab, { tab: string; button: string; hint: string }> = {
  continue: { tab: 'Continue', button: 'Continue', hint: 'Optional direction, e.g. "she refuses, coldly"' },
  rewrite: { tab: 'Rewrite', button: 'Rewrite selection', hint: 'How to rewrite, e.g. "tighter, more tension"' },
  beats: { tab: 'Beats', button: 'Write from beats', hint: 'One beat per line' },
}

/** One-click actions on the selected passage (Describe: at the cursor). */
const QUICK: [ActionId, string, string][] = [
  ['expand', 'Expand', 'Select a passage: adds detail and interiority'],
  ['shorten', 'Shorten', 'Select a passage: cuts it to about two thirds'],
  ['show', 'Show it', 'Select a passage: turns telling into action and sensation'],
  ['dialogue', 'Sharpen dialogue', 'Select a passage: more subtext, a distinct voice for each speaker'],
  ['describe', 'Describe', 'Writes a description at the cursor'],
]

const n = (x: number) => x.toLocaleString(numLocale())

export default function ContextPanel() {
  const book = useStore(s => s.book)!
  const tick = useStore(s => s.editorTick)
  const running = useAI(s => s.running)
  const hasProposal = useAI(s => s.hasProposal)
  const checks = useAI(s => s.checks)
  const [action, setAction] = useState<Tab>('continue')
  const [text, setText] = useState<Record<Tab, string>>({ continue: '', rewrite: '', beats: '' })
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [preview, setPreview] = useState(false)
  const [alts, setAlts] = useState<{ texts: string[]; from: number; to: number; original: string } | null>(null)
  const taste = useNotes(s => s.taste.length)
  const [learning, setLearning] = useState(false)
  // Beats to prose falls back on the plan card's note when no beats are written.
  const sceneNote = useStore(s => s.book?.chapters.flatMap(c => c.scenes).find(x => x.id === s.sceneId)?.note ?? '')
  const instruction = action === 'beats' && !text.beats.trim() ? sceneNote : text[action]
  const t = useT()
  const prompts = allPrompts()
  const voice = book.meta.voice
  const setActionPrompt = (id: string) => useStore.getState().updateMeta({ voice: { ...voice, actionPrompts: { ...voice.actionPrompts, [action]: id || undefined } } })

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
        {(Object.keys(LABELS) as Tab[]).map(a => (
          <button key={a} type="button" aria-pressed={action === a} onClick={() => setAction(a)}>{t(LABELS[a].tab)}</button>
        ))}
      </div>

      <textarea
        className="sk-input pl-instruction"
        rows={action === 'beats' ? 6 : 3}
        placeholder={action === 'beats' && sceneNote ? sceneNote : t(LABELS[action].hint) + ' · ' + t('@Name sends the full entry')}
        value={text[action]}
        onChange={e => setText(t => ({ ...t, [action]: e.target.value }))}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runAction(action, instruction, overrides) } }}
      />

      <div className="pl-row">
        <PresetSelect value={settings} onChange={setSetting} />
      </div>
      <div className="pl-row">
        <select className="sk-select sk-btn-sm" value={voice.actionPrompts[action as ActionId] ?? ''} onChange={e => setActionPrompt(e.target.value)} aria-label={t('Prompt')} title={t('Instructions from your prompt library for this action')}>
          <option value="">{t('Prompt')} : {voice.prompt ? (prompts.find(p => p.id === voice.prompt)?.name ?? '–') + ' ' + t('(book)') : t('None')}</option>
          {prompts.map(p => <option key={p.id} value={p.id}>{t('Prompt')} : {p.preset ? t(p.name) : p.name}</option>)}
        </select>
      </div>
      <div className="pl-row pl-quick" role="group" aria-label={t('Quick actions')}>
        {QUICK.map(([id, label, hint]) => (
          <button key={id} type="button" className="sk-btn sk-btn-sm sk-btn-ghost" disabled={hasProposal || !!running} title={t(hint)} onClick={() => runAction(id, '', overrides)}>{t(label)}</button>
        ))}
      </div>
      {isCheap() && <p className="sk-hint pl-cheap">{t('Cheap mode: past your usage threshold, calls use Haiku.')}</p>}
      <div className="pl-send">
        {running ? (
          <button type="button" className="sk-btn sk-btn-danger" onClick={stopAction}><Square size={14} /> {t('Stop')}</button>
        ) : (
          <button type="button" className="sk-btn sk-btn-primary" disabled={hasProposal} onClick={() => runAction(action, instruction, overrides)}>
            <Send size={14} /> {t(LABELS[action].button)}
          </button>
        )}
        {!running && (
          <button type="button" className="sk-btn" disabled={hasProposal} title={t('Three versions side by side; keep the one you like')}
            onClick={async () => { const r = await alternatives(action, instruction, overrides); if (r) setAlts({ ...r, original: getEditorView()?.state.doc.sliceString(r.from, r.to) ?? '' }) }}>
            <Copy size={14} /> {t('×3')}
          </button>
        )}
      </div>

      {hasProposal && !running && (
        <div className="pl-proposalbar">
          <span>{t('Proposal')}</span>
          <span className="pl-grow" />
          <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={accept} title="Tab"><Check size={14} /> {t('Accept')}</button>
          <button type="button" className="sk-btn sk-btn-sm" onClick={() => retry()}><RotateCcw size={14} /> {t('Retry')}</button>
          <button type="button" className="sk-btn sk-btn-sm sk-btn-ghost" onClick={discard} title="Esc"><X size={14} /> {t('Discard')}</button>
        </div>
      )}

      {hasProposal && !running && checks.length > 0 && (
        <section className="pl-scorecard" aria-label={t('Your rules')}>
          <div className="pl-row">
            <span className="sk-label">{t('Your rules')}</span>
            <span className="pl-grow" />
            <span className="sk-num">{checks.filter(c => c.ok).length} / {checks.length}</span>
          </div>
          {checks.map(c => (
            <div key={c.id} className={`pl-check ${c.ok ? 'pl-ok' : 'pl-bad'}`} title={c.ok ? '' : c.fix}>
              {c.ok ? <CircleCheck size={13} /> : <CircleX size={13} />}
              <span className="pl-grow">{t(c.label)}</span>
              <span className="sk-num">{c.detail}</span>
            </div>
          ))}
          {checks.some(c => !c.ok) && (
            <button type="button" className="sk-btn sk-btn-sm" onClick={retryFixing}><Wand2 size={14} /> {t('Retry fixing these')}</button>
          )}
        </section>
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

      {taste >= 6 && (
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm pl-learn" disabled={learning}
          title={t('Claude reads the proposals you kept and threw away and notes what you like, in Settings → Voice.')}
          onClick={async () => { setLearning(true); try { await learnTaste(); useStore.getState().notify('ok', t('Noted in Settings → Voice.')) } catch (e) { useStore.getState().notify('error', (e as Error).message) } setLearning(false) }}>
          <GraduationCap size={13} /> {learning ? t('Learning…') : t('Learn from my choices ({n})', { n: taste })}
        </button>
      )}

      {alts && (
        <Dialog wide title={t('Alternatives')} subtitle={t('Edit any of them, then use the one you want.')} onClose={() => setAlts(null)}>
          <div className="pl-alts">
            {alts.texts.map((x, i) => <Alternative key={i} text={x} original={alts.original} onUse={v => { pickAlternative(v, alts.from, alts.to); setAlts(null) }} />)}
          </div>
        </Dialog>
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

function Alternative({ text, original, onUse }: { text: string; original: string; onUse: (text: string) => void }) {
  const [v, setV] = useState(text)
  const [diff, setDiff] = useState(!!original.trim())
  const t = useT()
  const parts = diff ? diffWords(original, v) : []
  return (
    <div className="pl-alt">
      {original.trim() && <label className="pl-row pl-check-label"><input type="checkbox" className="sk-check" checked={diff} onChange={e => setDiff(e.target.checked)} /> {t('Show what changes')}</label>}
      {diff && <div className="pl-diff">{parts.map((p, i) => p.kind === 'same' ? <span key={i}>{p.text}</span> : p.kind === 'add' ? <ins key={i}>{p.text}</ins> : <del key={i}>{p.text}</del>)}</div>}
      <textarea className="sk-input" value={v} onChange={e => setV(e.target.value)} />
      <button type="button" className="sk-btn sk-btn-primary sk-btn-sm" onClick={() => onUse(v)}><Check size={13} /> {t('Use this one')}</button>
    </div>
  )
}
