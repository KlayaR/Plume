// Compare prompts: the scene you are in, written with two or three setups and shown
// without their labels. Pick the one you would keep; Plume then says which it was,
// keeps count on this computer, and can make the winner your setup.
import { useMemo, useState } from 'react'
import { FlaskConical, Plus, Trash2 } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { MODELS, type Model } from '../lib/types'
import { SAMPLE_WORDS } from '../lib/context'
import { choosablePrompts } from '../lib/voice'
import { FANTASY_BRIEF_ID, FANTASY_ID } from '../lib/defaults'
import { recordWin, runTrial, tallies, tallyOf, trialTask, variantName, type TrialText, type Variant } from '../trial'
import { estimateTokens } from '../lib/text'
import { numLocale, useT } from '../i18n'

const SAMPLE_CHOICES = [0, 1500, 6000, 12000]

export default function TrialDialog({ onClose }: { onClose: () => void }) {
  const book = useStore(s => s.book)!
  const sceneId = useStore(s => s.sceneId)
  const draft = useStore(s => s.prefs.roles.draft)
  const t = useT()
  const task = trialTask(book, sceneId)
  const prompts = choosablePrompts()
  const mine: Variant = { prompt: book.meta.voice.prompt || FANTASY_ID, model: draft.model, samples: book.meta.ai.sampleWords ?? SAMPLE_WORDS }
  // Your setup against one that differs in one thing: the short brief if you use the long fantasy prompt, else a stronger model.
  const [variants, setVariants] = useState<Variant[]>(() => [mine, mine.prompt === FANTASY_ID ? { ...mine, prompt: FANTASY_BRIEF_ID } : { ...mine, model: mine.model === 'opus' ? 'fable' : 'opus' }])
  const [busy, setBusy] = useState<number | null>(null)
  const [texts, setTexts] = useState<TrialText[] | null>(null)
  const [winner, setWinner] = useState<number | null>(null)
  const [all, setAll] = useState(tallies)
  const n = (x: number) => x.toLocaleString(numLocale())
  const set = (i: number, patch: Partial<Variant>) => setVariants(v => v.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  // Shown in an order that says nothing about which setup wrote what.
  const order = useMemo(() => (texts ?? []).map((_, i) => i).sort(() => Math.random() - 0.5), [texts])
  const name = (v: Variant) => variantName(v, book.meta.language, t('words of samples'), t)
  const same = variants.some((v, i) => variants.some((w, k) => k < i && w.prompt === v.prompt && w.model === v.model && w.samples === v.samples))

  const run = async () => {
    setTexts(null); setWinner(null); setBusy(0)
    const out = await runTrial(variants, done => setBusy(done))
    setBusy(null)
    if (out) setTexts(out)
  }
  const pick = (i: number) => {
    if (!texts || winner !== null) return
    setWinner(i)
    setAll(recordWin(texts.map(x => x.variant), texts[i].variant))
  }
  const use = (v: Variant) => {
    const st = useStore.getState()
    st.updateMeta({ voice: { ...st.book!.meta.voice, prompt: v.prompt }, ai: { ...st.book!.meta.ai, sampleWords: v.samples } })
    st.setPrefs({ roles: { ...st.prefs.roles, draft: { ...st.prefs.roles.draft, model: v.model } } })
    st.notify('ok', t('This setup now writes your book.'))
  }

  return (
    <Dialog wide title={t('Compare prompts')} icon={FlaskConical} onClose={onClose} footer={<button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Close')}</button>}>
      <div className="pl-find">
        {!task && <p className="sk-hint">{t('Open a scene that has a plan card (a note or beats): the trial writes it from that card.')}</p>}
        {task && (
          <>
            <p className="sk-hint">{t('“{title}” is written from its card with each setup, from an empty page{part}. You see the texts without knowing which setup wrote which, and pick the one you would keep.', { title: task.scene.title, part: task.beats >= 6 ? t(' (its first beats only)') : '' })}</p>
            {variants.map((v, i) => (
              <div key={i} className="pl-row pl-trial-row">
                <select className="sk-input pl-grow" value={v.prompt} onChange={e => set(i, { prompt: e.target.value })} aria-label={t('Prompt')}>
                  {prompts.map(p => <option key={p.id} value={p.id}>{p.preset ? t(p.name) : p.name}</option>)}
                </select>
                <select className="sk-input" value={v.model} onChange={e => set(i, { model: e.target.value as Model })} aria-label={t('Model')}>
                  {MODELS.map(m => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
                </select>
                <select className="sk-input" value={v.samples} onChange={e => set(i, { samples: Number(e.target.value) })} aria-label={t('Samples of your prose')}>
                  {[...new Set([...SAMPLE_CHOICES, v.samples])].sort((a, b) => a - b).map(s => <option key={s} value={s}>{n(s)} {t('words of samples')}</option>)}
                </select>
                {tallyOf(all, v).runs > 0 && <span className="sk-hint">{t('won {w} of {r}', { w: tallyOf(all, v).wins, r: tallyOf(all, v).runs })}</span>}
                {variants.length > 2 && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm sk-btn-icon" aria-label={t('Remove')} onClick={() => setVariants(x => x.filter((_, k) => k !== i))}><Trash2 size={13} /></button>}
              </div>
            ))}
            <div className="pl-row">
              {variants.length < 3 && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setVariants(x => [...x, { ...x[x.length - 1] }])}><Plus size={13} /> {t('Add a setup')}</button>}
              <span className="pl-grow" />
              {same && <span className="sk-hint pl-warn">{t('Two setups are the same.')}</span>}
              <button type="button" className="sk-btn sk-btn-primary" disabled={busy !== null || same} onClick={run}>
                <FlaskConical size={14} /> {busy !== null ? t('Writing {a} of {b}…', { a: busy + 1, b: variants.length }) : t('Write with each')}
              </button>
            </div>
          </>
        )}
        {texts && (
          <div className="pl-trial-cols" style={{ gridTemplateColumns: `repeat(${texts.length}, minmax(0, 1fr))` }}>
            {order.map((i, k) => (
              <section key={i} className={`pl-trial-col ${winner === i ? 'pl-trial-won' : ''}`}>
                <div className="pl-row">
                  <b className="pl-grow">{winner === null ? String.fromCharCode(65 + k) : name(texts[i].variant)}</b>
                  {winner === null && <button type="button" className="sk-btn sk-btn-sm sk-btn-primary" onClick={() => pick(i)}>{t('This one')}</button>}
                  {winner === i && <button type="button" className="sk-btn sk-btn-sm" onClick={() => use(texts[i].variant)}>{t('Use this setup')}</button>}
                </div>
                <span className="sk-hint">{n((texts[i].text.match(/\S+/g) ?? []).length)} {t('words')}{winner !== null ? ` · ≈ ${n(estimateTokens(texts[i].text))} ${t('tokens')}` : ''}</span>
                <div className="pl-trial-text">{texts[i].text}</div>
              </section>
            ))}
          </div>
        )}
        {winner !== null && <p className="sk-hint">{t('One trial says little: run it on a few different scenes before you change your setup. The counts are kept on this computer.')}</p>}
      </div>
    </Dialog>
  )
}
