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

const SCHEMA = {
  list: JSON.stringify({ type: 'object', properties: { items: { type: 'array' } }, required: ['items'] }),
  object: JSON.stringify({ type: 'object' }),
}

/** What a JSON task returns to its caller: the list itself, not the object the schema wraps it in. */
function unwrap(text: string, json: AskOptions['json']): string {
  if (json !== 'list') return text
  const d = parseJSON<{ items?: unknown }>(text)
  return d && !Array.isArray(d) && Array.isArray(d.items) ? JSON.stringify(d.items) : text
}

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
  if (!o.json || parseJSON(first) !== null) return first
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
