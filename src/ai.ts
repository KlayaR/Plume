// One-shot Claude tasks outside the editor's proposals: voice description,
// summaries, bible drafts, checks, chat, agent tasks. Each uses the lean CLI
// call, records real usage, and resolves with the reply text.
import { cancelClaude, runClaude } from './lib/claude'
import type { Effort, Model } from './lib/types'
import { useStore } from './store'
import { t } from './i18n'

export interface AskOptions {
  system: string
  message: string
  model?: Model
  effort?: Effort
  /** Text as it streams in. */
  onText?: (text: string) => void
  /** Agent tasks only: tools the CLI may use, and the folder it works in (read-only tools). */
  tools?: string
  cwd?: string
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

export function ask(o: AskOptions): Promise<string> {
  const st = useStore.getState()
  if (!st.claudeExe) return Promise.reject(new Error(t('The claude command line was not found. Set its path in Settings.')))
  const { model, effort } = effective(o.model ?? 'sonnet', o.effort ?? 'low')
  return new Promise((resolve, reject) => {
    runClaude(
      { exe: st.claudeExe!, model, effort, system: o.system, message: o.message, tools: o.tools, cwd: o.cwd },
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
export const stopAsk = () => { if (current) cancelClaude(current) }

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
