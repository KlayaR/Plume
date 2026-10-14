// Where an AI request goes: the claude command line (the default), or
// OpenRouter, either because the chosen preset says so, or as a fallback when
// the Claude plan's usage is used up. Every AI call in the app goes through
// runLLM, so the rest of the code doesn't care which one answers.
import { useStore } from './store'
import { cancelClaude, runClaude, type Result } from './lib/claude'
import { chatBody, httpMessage, isLimitError, presetFor, readEvent, readModels, splitSSE, type ModelInfo, type Preset } from './lib/presets'
import type { Effort, Model } from './lib/types'
import { newId } from './lib/text'
import { t } from './i18n'

const BASE = 'https://openrouter.ai/api/v1'
// Only the two headers every browser request needs: extra ones (the optional app-attribution
// headers) would need to pass OpenRouter's CORS preflight from the app's web view.
const headers = (key: string) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' })

export interface LlmRequest {
  system: string
  message: string
  model: Model
  effort: Effort
  /** An OpenRouter model id to use for this request, without a saved preset. */
  orModel?: string
  /** An OpenRouter preset to use for this request (a Claude preset is resolved into model and effort first). */
  preset?: string
  /** Agent tasks that read files: only the claude command line can do these. */
  tools?: string
  cwd?: string
}

/** Settings of an action, turned into what a request needs: a Claude preset becomes its model and effort, an OpenRouter one stays a preset. */
export function choose(s: { model: Model; effort: Effort; preset?: string }): { model: Model; effort: Effort; preset?: string } {
  const p = presetFor(s, useStore.getState().prefs.presets)
  if (p?.backend === 'openrouter') return { model: s.model, effort: s.effort, preset: p.id }
  if (p) return { model: p.model as Model, effort: p.effort }
  return { model: s.model, effort: s.effort }
}

/** Can a request be made at all: the claude command line is found, or OpenRouter is set up. */
export function canRun(): boolean {
  const st = useStore.getState()
  return !!st.claudeExe || !!st.prefs.orKey
}

const fallbackPreset = (): Preset | null => {
  const { prefs } = useStore.getState()
  const p = prefs.presets.find(x => x.id === prefs.fallbackPreset && x.backend === 'openrouter')
  return p && prefs.orKey ? p : null
}

/** The plan's five-hour or weekly window is full. */
const limitsReached = () => {
  const l = useStore.getState().limits
  return (l?.fiveHour?.used ?? 0) >= 1 || (l?.week?.used ?? 0) >= 1
}

// --- OpenRouter ------------------------------------------------------------------------

const aborts = new Map<string, AbortController>()

function runOpenRouter(key: string, model: string, system: string, message: string, onText: (t: string) => void, onDone: (r: Result) => void): string {
  const id = newId()
  const ctl = new AbortController()
  aborts.set(id, ctl)
  let text = ''
  const push = (s: string) => { text += s; onText(s) }
  ;(async () => {
    try {
      const res = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers: headers(key), body: JSON.stringify(chatBody(model, system, message)), signal: ctl.signal })
      if (!res.ok) throw new Error(t(httpMessage(res.status, await res.text())))
      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const cut = splitSSE(buf)
        buf = cut.rest
        for (const ev of cut.events) {
          const d = readEvent(ev)
          if (d.error) throw new Error(d.error)
          if (d.text) push(d.text)
        }
      }
      const last = readEvent(buf)
      if (last.error) throw new Error(last.error)
      if (last.text) push(last.text)
      if (!text.trim()) throw new Error(t('The model returned nothing.'))
      onDone({ ok: true, text })
    } catch (e) {
      if (ctl.signal.aborted) onDone({ ok: false, stopped: true, text, error: t('Stopped.') })
      else onDone({ ok: false, text, error: (e as Error).message })
    } finally { aborts.delete(id) }
  })()
  return id
}

let modelCache: ModelInfo[] | null = null
/** Every model OpenRouter offers (public list, no key needed), cached for the session. */
export async function openRouterModels(): Promise<ModelInfo[]> {
  if (modelCache) return modelCache
  const res = await fetch(`${BASE}/models`)
  if (!res.ok) throw new Error(t(httpMessage(res.status, await res.text())))
  modelCache = readModels(await res.json())
  return modelCache
}

/** Checks the key and says how much credit is left. */
export async function testOpenRouterKey(key: string): Promise<string> {
  const h = { Authorization: `Bearer ${key}` }
  const credits = await fetch(`${BASE}/credits`, { headers: h })
  if (credits.ok) {
    const d = (await credits.json()).data
    const left = Number(d?.total_credits) - Number(d?.total_usage)
    if (Number.isFinite(left)) return t('Key accepted: ${n} of credit left.', { n: left.toFixed(2) })
  }
  const res = await fetch(`${BASE}/key`, { headers: h })
  if (!res.ok) throw new Error(t(httpMessage(res.status, await res.text())))
  return t('Key accepted.')
}

// --- Routing ----------------------------------------------------------------------------

interface Active { kind: 'claude' | 'openrouter'; inner: string; stop: boolean }
const active = new Map<string, Active>()

export async function runLLM(req: LlmRequest, onText: (t: string) => void, onDone: (r: Result) => void): Promise<string> {
  const st = useStore.getState()
  const { prefs } = st
  const outer = newId()
  const fb = fallbackPreset()
  const agent = !!req.tools
  const finish = (r: Result) => { active.delete(outer); onDone(r) }

  const startOR = (p: Preset) => {
    if (!prefs.orKey) return finish({ ok: false, text: '', error: t('Add your OpenRouter key in Settings → Claude.') })
    const a: Active = { kind: 'openrouter', inner: '', stop: false }
    active.set(outer, a)
    useStore.setState({ lastBackend: { kind: 'openrouter', name: p.name } })
    a.inner = runOpenRouter(prefs.orKey, p.model, req.system, req.message, onText, finish)
  }

  const startClaude = async (allowFallback: boolean) => {
    if (!st.claudeExe) {
      if (fb && !agent) return startOR(fb)
      return finish({ ok: false, text: '', error: t('The claude command line was not found. Set its path in Settings.') })
    }
    const a: Active = { kind: 'claude', inner: '', stop: false }
    active.set(outer, a)
    useStore.setState({ lastBackend: { kind: 'claude', name: req.model } })
    a.inner = await runClaude(
      { exe: st.claudeExe, model: req.model, effort: req.effort, system: req.system, message: req.message, tools: req.tools, cwd: req.cwd },
      onText,
      r => {
        // The plan ran out before anything came back: the same request goes to OpenRouter.
        if (allowFallback && fb && !r.ok && !r.stopped && !r.text.trim() && isLimitError(r.error)) {
          useStore.getState().notify('warn', t('Claude’s usage limit is reached: continuing with {name} on OpenRouter.', { name: fb.name }))
          return startOR(fb)
        }
        finish(r)
      },
    )
    if (a.stop) cancelClaude(a.inner)
  }

  const adhoc: Preset | undefined = req.orModel ? { id: 'adhoc', name: req.orModel, backend: 'openrouter', model: req.orModel, effort: 'low' } : undefined
  const chosen = adhoc ?? (req.preset ? prefs.presets.find(p => p.id === req.preset) : undefined)
  if (chosen?.backend === 'openrouter') {
    if (agent) finish({ ok: false, text: '', error: t('This task reads files, so it needs the claude command line.') })
    else startOR(chosen)
  } else {
    const useFallback = !agent && !!fb && (prefs.fallback === 'always' || (prefs.fallback === 'auto' && limitsReached()))
    if (useFallback) startOR(fb!)
    else await startClaude(!agent && !!fb && prefs.fallback === 'auto')
  }
  return outer
}

export function cancelLLM(id: string) {
  const a = active.get(id)
  if (!a) return
  a.stop = true
  if (!a.inner) return
  if (a.kind === 'claude') cancelClaude(a.inner)
  else aborts.get(a.inner)?.abort()
}
