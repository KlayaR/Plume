// One-shot Claude tasks outside the editor's proposals: voice description,
// summaries, bible drafts, checks, chat, agent tasks. Each uses the lean CLI
// call, records real usage, and resolves with the reply text.
import type { Effort, Model, Role } from './lib/types'
import { canRun, cancelLLM, choose, runLLM } from './llm'
import { useStore } from './store'
import { t } from './i18n'

export interface AskOptions {
  system: string
  message: string
  model?: Model
  effort?: Effort
  /** What the request is for: its model and effort come from Settings → Claude (overrides model and effort). */
  role?: Role
  /** A model preset id (Settings → Claude); overrides model and effort. */
  preset?: string
  /** An OpenRouter model id (used as is, no saved preset needed). */
  orModel?: string
  /** Text as it streams in. */
  onText?: (text: string) => void
  /** Agent tasks only: tools the CLI may use, and the folder it works in (read-only tools). */
  tools?: string
  cwd?: string
  /**
   * A JSON task: 'list' (an array) or 'object'. On the claude command line the reply is held
   * to that shape, and a list comes back as the array itself; a reply that can't be read is asked again once.
   */
  json?: 'list' | 'object'
}

// The command line's schema must be an object with named parts: a bare { type: 'object' } comes back
// as {} (seen on the real command line), so both shapes travel inside a wrapper, taken off on return.
const SCHEMA = {
  list: JSON.stringify({ type: 'object', properties: { items: { type: 'array' } }, required: ['items'] }),
  object: JSON.stringify({ type: 'object', properties: { value: { type: 'object', additionalProperties: true } }, required: ['value'] }),
}

/** What a JSON task returns to its caller: the list or the object itself, not the wrapper the schema puts it in. */
export function unwrap(text: string, json: AskOptions['json']): string {
  if (!json) return text
  const d = parseJSON<{ items?: unknown; value?: unknown }>(text)
  if (!d || Array.isArray(d)) return text
  const keys = Object.keys(d)
  // Sometimes the inside comes as a string of JSON: read it too.
  const inner = (v: unknown) => (typeof v === 'string' ? parseJSON<unknown>(v) : v)
  if (json === 'list') { const v = inner(d.items); return Array.isArray(v) ? JSON.stringify(revive(v)) : text }
  const v = keys.length === 1 && keys[0] === 'value' ? inner(d.value) : null
  return v && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(revive(v)) : text
}

/** A list or object that arrived as a string of JSON inside the reply (the command line does this at times) becomes itself again. */
function revive(v: unknown): unknown {
  if (typeof v === 'string') {
    const s = v.trim()
    if (!/^[[{][\s\S]*[\]}]$/.test(s)) return v
    try { const d: unknown = JSON.parse(s); return d && typeof d === 'object' ? revive(d) : v } catch { return v }
  }
  if (Array.isArray(v)) return v.map(revive)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]))
  return v
}

/** A reply a JSON task can use: it parses, and an object isn't empty. */
const usable = (text: string) => { const d = parseJSON<unknown>(text); return d !== null && (Array.isArray(d) || Object.keys(d as object).length > 0) }

/**
 * Cheap mode: past the 5-hour usage threshold set in Settings, every call
 * goes to Haiku with low effort. Returns the model and effort to use.
 */
export function effective(model: Model, effort: Effort): { model: Model; effort: Effort; cheap: boolean } {
  const { prefs, limits } = useStore.getState()
  const used = limits?.fiveHour?.used ?? 0
  if (prefs.cheapAt > 0 && used * 100 >= prefs.cheapAt) return { model: 'haiku', effort: 'low', cheap: true }
  return { model, effort, cheap: false }
}

export const isCheap = () => effective('sonnet', 'low').cheap

let current: string | null = null

export async function ask(o: AskOptions): Promise<string> {
  const first = unwrap(await askOnce(o), o.json)
  if (!o.json || usable(first)) return first
  return unwrap(await askOnce(o), o.json)
}

function askOnce(o: AskOptions): Promise<string> {
  const st = useStore.getState()
  if (!canRun()) return Promise.reject(new Error(t('The claude command line was not found. Set its path in Settings.')))
  const r = o.role ? st.prefs.roles[o.role] : undefined
  const c = choose({ model: r?.model ?? o.model ?? 'sonnet', effort: r?.effort ?? o.effort ?? 'low', preset: o.preset })
  const { model, effort } = effective(c.model, c.effort)
  return new Promise((resolve, reject) => {
    runLLM(
      { model, effort, preset: c.preset, orModel: o.orModel, system: o.system, message: o.message, tools: o.tools, cwd: o.cwd, schema: o.json && !o.tools ? SCHEMA[o.json] : undefined },
      text => o.onText?.(text),
      r => {
        current = null
        if (r.usage) useStore.getState().recordUsage(r.usage)
        if (r.ok) resolve(r.text)
        else reject(new Error(r.error ?? t('The request failed.')))
      },
    ).then(id => { current = id })
  })
}

/** Stops the task running now, if any. */
export const stopAsk = () => { if (current) cancelLLM(current) }

/** The first JSON array or object in a reply (Claude sometimes wraps it in prose or a code fence). */
export function parseJSON<T>(text: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = fenced ? fenced[1] : text
  const start = body.search(/[[{]/)
  if (start < 0) return null
  const open = body[start]
  const close = open === '[' ? ']' : '}'
  const end = body.lastIndexOf(close)
  if (end <= start) return null
  try { return JSON.parse(body.slice(start, end + 1)) as T } catch { return null }
}

/** A short stable hash of a text, to know when a summary is out of date. */
export function hashText(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}
