// Model presets: a named choice of backend, model and effort, so the author
// picks "Writing" instead of scrolling a list of hundreds of models. A preset
// runs on the claude command line (haiku, sonnet, opus) or on OpenRouter (any
// model id). Also the pure parts of talking to OpenRouter.
import type { Effort, Model } from './types'

export type Backend = 'claude' | 'openrouter'

export interface Preset { id: string; name: string; backend: Backend; model: string; effort: Effort }

export const CLAUDE_MODELS: Model[] = ['haiku', 'sonnet', 'opus']

export const DEFAULT_PRESETS: Preset[] = [
  { id: 'quick', name: 'Quick (Haiku)', backend: 'claude', model: 'haiku', effort: 'low' },
  { id: 'writing', name: 'Writing (Sonnet)', backend: 'claude', model: 'sonnet', effort: 'low' },
  { id: 'deep', name: 'Deep (Opus)', backend: 'claude', model: 'opus', effort: 'high' },
]

/** When to use OpenRouter instead of the claude command line. */
export type Fallback = 'off' | 'auto' | 'always'

interface Choice { model: Model; effort: Effort; preset?: string }

/** The preset an action's settings stand for: its chosen one, or the one with the same Claude model and effort. */
export function presetFor(s: Choice, presets: Preset[]): Preset | null {
  if (s.preset) { const p = presets.find(x => x.id === s.preset); if (p) return p }
  return presets.find(p => p.backend === 'claude' && p.model === s.model && p.effort === s.effort) ?? null
}

/** Did the claude command fail because the plan's usage is used up? */
export const isLimitError = (msg?: string) => !!msg && /usage limit|limit reached|rate limit|hit your .*limit|out of (extra )?usage/i.test(msg)

/** Cuts a received chunk into complete server-sent events; what is left waits for the next chunk. */
export function splitSSE(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split(/\r?\n\r?\n/)
  const rest = parts.pop() ?? ''
  return { events: parts, rest }
}

export interface Delta { text?: string; error?: string; done?: boolean }

/** What one event carries: a piece of text, an error, or the end. Comment lines (": OPENROUTER PROCESSING") are ignored. */
export function readEvent(event: string): Delta {
  const data = event.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('')
  if (!data) return {}
  if (data === '[DONE]') return { done: true }
  try {
    const j = JSON.parse(data)
    if (j.error) return { error: String(j.error.message ?? j.error) }
    const c = j.choices?.[0]
    const text = c?.delta?.content ?? c?.message?.content
    if (c?.finish_reason === 'error') return { error: 'The model stopped with an error.' }
    return typeof text === 'string' && text ? { text } : {}
  } catch { return {} }
}

/** The request body for a streamed chat completion. */
export const chatBody = (model: string, system: string, message: string) => ({
  model, stream: true,
  messages: [...(system.trim() ? [{ role: 'system', content: system }] : []), { role: 'user', content: message }],
})

/** A human message for an OpenRouter HTTP failure. */
export function httpMessage(status: number, body: string): string {
  let said = ''
  try { said = JSON.parse(body)?.error?.message ?? '' } catch { said = body.slice(0, 200) }
  if (status === 401) return 'The OpenRouter key was refused. Check it in Settings → Claude.'
  if (status === 402) return 'OpenRouter has no credit left. Add some at openrouter.ai/credits.'
  if (status === 429) return 'OpenRouter is rate limiting this model. Try again in a moment.'
  return `OpenRouter: ${said || `HTTP ${status}`}`.slice(0, 300)
}

export interface ModelInfo { id: string; name: string; context: number; promptPrice: number; completionPrice: number }

/** The /models list as a flat array (prices are per million tokens), sorted by name. */
export function readModels(json: unknown): ModelInfo[] {
  const data = (json as { data?: Record<string, any>[] } | null)?.data
  if (!Array.isArray(data)) return []
  return data.filter(m => typeof m.id === 'string').map(m => ({
    id: m.id, name: String(m.name ?? m.id), context: Number(m.context_length) || 0,
    promptPrice: (Number(m.pricing?.prompt) || 0) * 1e6, completionPrice: (Number(m.pricing?.completion) || 0) * 1e6,
  })).sort((a, b) => a.name.localeCompare(b.name))
}

/** Models whose id or name contains every word of the query. */
export function searchModels(list: ModelInfo[], query: string): ModelInfo[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return words.length ? list.filter(m => words.every(w => `${m.id} ${m.name}`.toLowerCase().includes(w))) : list
}
