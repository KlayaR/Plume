// Talks to the `claude` command line through the native side, and reads its
// stream-json output: text as it arrives, real usage, and plan limits.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Effort, Model } from './types'
import { newId } from './text'

export interface Usage { input: number; cacheWrite: number; cacheRead: number; output: number }
export interface Window { used: number; resetsAt: number }
export interface Limits { fiveHour?: Window; week?: Window }

export interface Result { ok: boolean; text: string; usage?: Usage; error?: string; stopped?: boolean }

interface Run {
  text: string
  stopped: boolean
  result?: { is_error?: boolean; result?: string; usage?: Record<string, number> }
  onText: (t: string) => void
  onDone: (r: Result) => void
}

const runs = new Map<string, Run>()
// Messages are translated by the app (set once at start), to keep this module free of UI imports.
type Tr = (text: string, vars?: Record<string, string | number>) => string
let tr: Tr = (text, vars) => vars ? Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), text) : text
export const setClaudeTranslator = (f: Tr) => { tr = f }
let onLimits: (l: Limits) => void = () => {}
export const setLimitsListener = (f: (l: Limits) => void) => { onLimits = f }

let ready: Promise<unknown> | null = null
function ensureListening() {
  ready ??= Promise.all([
    listen<{ id: string; line: string }>('claude-line', e => handleLine(e.payload.id, e.payload.line)),
    listen<{ id: string; code: number | null; stderr: string }>('claude-done', e => finish(e.payload.id, e.payload.code, e.payload.stderr)),
  ])
  return ready
}

function handleLine(id: string, line: string) {
  const run = runs.get(id)
  let msg: any
  try { msg = JSON.parse(line) } catch { return }
  if (msg.type === 'rate_limit_event') {
    const w = msg.rate_limit_info?.unifiedWindows ?? {}
    const pick = (x: any): Window | undefined => x && typeof x.utilization === 'number' ? { used: x.utilization, resetsAt: x.resetsAt } : undefined
    onLimits({ fiveHour: pick(w.five_hour), week: pick(w.seven_day) })
  }
  if (!run) return
  if (msg.type === 'stream_event' && msg.event?.type === 'content_block_delta' && msg.event.delta?.type === 'text_delta') {
    run.text += msg.event.delta.text
    run.onText(msg.event.delta.text)
  } else if (msg.type === 'result') {
    run.result = msg
  }
}

const LIMIT_RE = /(usage|rate|session|weekly) limit|limit reached|hit your .*limit|out of (extra )?usage/i
const LOGIN_RE = /not logged in|log ?in|\/login|invalid api key|authentication/i

function finish(id: string, code: number | null, stderr: string) {
  const run = runs.get(id)
  if (!run) return
  runs.delete(id)
  const r = run.result
  const u = r?.usage
  const usage = u ? { input: u.input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 } : undefined
  if (run.stopped) return run.onDone({ ok: false, stopped: true, text: run.text, usage, error: tr('Stopped.') })
  if (r && !r.is_error && code === 0) return run.onDone({ ok: true, text: run.text || String(r.result ?? ''), usage })
  const said = String(r?.result ?? '') || stderr
  let error = said.trim().slice(0, 300) || tr('The claude command stopped (code {code}).', { code: String(code) })
  if (LIMIT_RE.test(said)) error = tr('Usage limit reached: {said}', { said: said.trim().slice(0, 200) })
  else if (LOGIN_RE.test(said)) error = tr('Claude is not signed in. Open a terminal, run `claude`, then type /login.')
  run.onDone({ ok: false, text: run.text, usage, error })
}

export const findClaude = (custom: string) => invoke<string | null>('find_claude', { custom: custom || null })

export async function runClaude(
  opts: { exe: string; model: Model; effort: Effort; system: string; message: string; tools?: string; cwd?: string },
  onText: (t: string) => void,
  onDone: (r: Result) => void,
): Promise<string> {
  await ensureListening()
  const id = newId() + newId()
  runs.set(id, { text: '', stopped: false, onText, onDone })
  try {
    await invoke('run_claude', { id, ...opts, tools: opts.tools ?? null, cwd: opts.cwd ?? null })
  } catch (e) {
    runs.delete(id)
    onDone({ ok: false, text: '', error: String(e) })
  }
  return id
}

export function cancelClaude(id: string) {
  const run = runs.get(id)
  if (run) run.stopped = true
  invoke('cancel_claude', { id }).catch(() => {})
}
