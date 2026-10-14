// LanguageTool: spelling and grammar in the book's own language, whatever
// dictionaries the PC has. Plume talks to a LanguageTool server over HTTP: the
// public one (api.languagetool.org: free, limited to about 20 requests a minute,
// and the text is sent to it), your own (a local server on your computer keeps
// everything private), or the Premium one with your key.
import type { Lang } from './types'

export const LT_DEFAULT = 'https://api.languagetool.org'

export interface LTConfig { server: string; user: string; key: string }
export type LTKind = 'spell' | 'grammar' | 'style'
export interface LTMatch {
  from: number
  to: number
  message: string
  short: string
  replacements: string[]
  rule: string
  category: string
  kind: LTKind
}

export class LTError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

/** French is French; English can be American, British, Canadian…, set in Settings. */
export const ltLanguage = (lang: Lang, english: string) => (lang === 'fr' ? 'fr' : english || 'en-US')

const MAX_CHARS = 15000 // the free server refuses more than 20,000 per request

/** Cuts a long text at paragraph breaks into pieces the server accepts, keeping each piece's place. */
export function chunks(text: string, max = MAX_CHARS): { offset: number; text: string }[] {
  if (text.length <= max) return [{ offset: 0, text }]
  const out: { offset: number; text: string }[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + max)
    if (end < text.length) {
      const cut = text.lastIndexOf('\n', end)
      end = cut > start ? cut + 1 : end
    }
    out.push({ offset: start, text: text.slice(start, end) })
    start = end
  }
  return out
}

interface RawMatch {
  message: string
  shortMessage?: string
  offset: number
  length: number
  replacements?: { value: string }[]
  rule: { id: string; issueType?: string; category?: { id?: string; name?: string } }
}

export function kindOf(m: RawMatch): LTKind {
  const type = (m.rule.issueType ?? '').toLowerCase()
  const cat = (m.rule.category?.id ?? '').toUpperCase()
  if (type === 'misspelling' || cat === 'TYPOS' || /ORTHO/.test(cat) || m.rule.id.startsWith('MORFOLOGIK') || m.rule.id.includes('SPELL')) return 'spell'
  // French rules come as "CAT_GRAMMAIRE", "CAT_HOMONYMES_PARONYMES", "CAT_CONJUGAISON"…, often with no issue type.
  if (type === 'grammar' || /GRAMM|HOMONYM|CONJUG|ACCORD|AGREE|CONFUS|VERB/.test(cat)) return 'grammar'
  return 'style'
}

const endpoint = (server: string) => {
  const base = (server.trim() || LT_DEFAULT).replace(/\/+$/, '')
  return /\/v2\/check$/.test(base) ? base : `${base}/v2/check`
}

async function post(cfg: LTConfig, params: Record<string, string>): Promise<{ matches: RawMatch[]; software?: { name?: string; version?: string } }> {
  const body = new URLSearchParams(params)
  if (cfg.user && cfg.key) { body.set('username', cfg.user); body.set('apiKey', cfg.key) }
  let res: Response
  try {
    // A plain form post: no CORS pre-flight needed.
    res = await fetch(endpoint(cfg.server), { method: 'POST', body, headers: { Accept: 'application/json' } })
  } catch {
    throw new LTError('Could not reach the LanguageTool server.')
  }
  if (res.status === 429) throw new LTError('LanguageTool says too many requests: wait a minute.', 429)
  if (!res.ok) throw new LTError(`LanguageTool: ${(await res.text().catch(() => '')).slice(0, 160) || res.status}`, res.status)
  return res.json()
}

/** Every issue LanguageTool finds in `text`, with positions in `text`. */
export async function ltCheck(text: string, language: string, cfg: LTConfig, disabledRules: string[] = []): Promise<LTMatch[]> {
  const out: LTMatch[] = []
  for (const part of chunks(text)) {
    if (!part.text.trim()) continue
    const params: Record<string, string> = { text: part.text, language }
    if (disabledRules.length) params.disabledRules = disabledRules.join(',')
    const r = await post(cfg, params)
    for (const m of r.matches ?? []) {
      out.push({
        from: part.offset + m.offset, to: part.offset + m.offset + m.length,
        message: m.message, short: m.shortMessage ?? '',
        replacements: (m.replacements ?? []).slice(0, 5).map(x => x.value),
        rule: m.rule.id, category: m.rule.category?.name ?? '', kind: kindOf(m),
      })
    }
  }
  return out
}

/** A tiny request to see that the server answers; returns its name and version. */
export async function ltTest(cfg: LTConfig): Promise<string> {
  const r = await post(cfg, { text: 'This are a test.', language: 'en-US' })
  return `${r.software?.name ?? 'LanguageTool'} ${r.software?.version ?? ''}`.trim()
}
