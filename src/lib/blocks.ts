// An entry's full text is a list of blocks: each "### Heading" starts one. The
// author decides, block by block, what the AI may read: always (with the short
// version), only with the full version, or never. The file stays plain
// Markdown; only the choices are kept, in the entry's front matter ("sends").

/** 'plan': read for planning and editing, never when Claude writes the story (a twist the prose must not give away). */
export type Send = 'always' | 'full' | 'plan' | 'never'

export interface Block { title: string; text: string }

/** The text before the first heading is a block with no title (the overview). */
export function parseBlocks(full: string): Block[] {
  const blocks: Block[] = []
  let cur: Block | null = null
  for (const line of full.split('\n')) {
    const h = /^###\s+(.*?)\s*$/.exec(line)
    if (h) { if (cur) blocks.push(cur); cur = { title: h[1], text: '' } }
    else { cur ??= { title: '', text: '' }; cur.text += (cur.text ? '\n' : '') + line }
  }
  if (cur) blocks.push(cur)
  return blocks.map(b => ({ title: b.title, text: b.text.trim() })).filter(b => b.title || b.text)
}

const render = (b: Block) => b.title ? `### ${b.title}${b.text ? `\n${b.text}` : ''}` : b.text

export const joinBlocks = (blocks: Block[]): string => blocks.map(render).join('\n\n')

const BOLD_LABEL = /^\s*(?:[-*]\s+)?(?:\*\*|__)([^*_\n:]{2,40}):(?:\*\*|__)\s*(.*)$|^\s*(?:[-*]\s+)?(?:\*\*|__)([^*_\n:]{2,40})(?:\*\*|__)\s*:\s*(.*)$/

/**
 * A full version cut into blocks: Claude's "- **Appearance:** …" lists and
 * "## Heading" lines become "### Heading" blocks, and a {Heading: text} object
 * one block per key. Text that is already in blocks comes back the same.
 */
export function toBlocks(full: string | Record<string, unknown> | null | undefined): string {
  if (full && typeof full === 'object') {
    return Object.entries(full).filter(([, v]) => String(v ?? '').trim()).map(([h, v]) => `### ${h.trim()}\n${String(v).trim()}`).join('\n\n')
  }
  let out = ''
  for (const line of String(full ?? '').split('\n')) {
    const bold = line.match(BOLD_LABEL)
    const head = line.match(/^#{1,3}\s+(.+)$/)
    if (bold) out += `\n\n### ${(bold[1] ?? bold[3]).trim()}${(bold[2] ?? bold[4]).trim() ? `\n${(bold[2] ?? bold[4]).trim()}` : ''}`
    else if (head) out += `\n\n### ${head[1].trim()}`
    else out += `\n${line}`
  }
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Adds the blocks of `b` to those of `a`: a block whose title is already there gets only the
 * paragraphs it doesn't hold yet, a new title goes at the end. `mergeBlocks('', full)` folds an
 * entry's repeated headings into one block each.
 */
export function mergeBlocks(a: string, b: string): string {
  const out: Block[] = []
  const key = (s: string) => s.trim().toLowerCase()
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
  for (const blk of [...parseBlocks(a), ...parseBlocks(b)]) {
    const same = out.find(x => key(x.title) === key(blk.title))
    if (!same) { out.push({ ...blk }); continue }
    const have = norm(same.text)
    const fresh = blk.text.split(/\n\s*\n/).filter(p => p.trim() && !have.includes(norm(p)))
    if (fresh.length) same.text = [same.text, ...fresh].filter(Boolean).join('\n\n')
  }
  return joinBlocks(out)
}

/** Block titles that appear more than once in a full version. */
export const repeatedTitles = (full: string) => {
  const seen = new Map<string, number>()
  for (const b of parseBlocks(full)) if (b.title) seen.set(b.title.trim().toLowerCase(), (seen.get(b.title.trim().toLowerCase()) ?? 0) + 1)
  return [...seen].filter(([, n]) => n > 1).map(([t]) => t)
}

/** How many blocks a full version has. */
export const blockCount = (full: string) => (full.match(/^###\s/gm) ?? []).length

export interface HasBlocks { full: string; sends?: Record<string, Send> }

export const sendOf = (e: HasBlocks, title: string): Send => e.sends?.[title] ?? 'full'

/** What the AI may read of an entry's blocks: the "always" ones, and everything not marked never. Empty blocks are left out. `prose`: Claude writes the story, so the planning-only blocks stay out too. */
export function aiBlocks(e: HasBlocks, prose = false): { always: string; visible: string; first: string } {
  const blocks = parseBlocks(e.full).filter(b => b.text && sendOf(e, b.title) !== 'never' && !(prose && sendOf(e, b.title) === 'plan'))
  return {
    always: blocks.filter(b => sendOf(e, b.title) === 'always').map(render).join('\n\n'),
    visible: blocks.map(render).join('\n\n'),
    first: blocks[0]?.text.split('\n\n')[0] ?? '',
  }
}

/** The full text without the blocks marked never (for everything sent to the AI). */
export const aiFull = (e: HasBlocks): string => aiBlocks(e).visible
