// An entry's full text is a list of blocks: each "### Heading" starts one. The
// author decides, block by block, what the AI may read: always (with the short
// version), only with the full version, or never. The file stays plain
// Markdown; only the choices are kept, in the entry's front matter ("sends").

export type Send = 'always' | 'full' | 'never'

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

/** How many blocks a full version has. */
export const blockCount = (full: string) => (full.match(/^###\s/gm) ?? []).length

export interface HasBlocks { full: string; sends?: Record<string, Send> }

export const sendOf = (e: HasBlocks, title: string): Send => e.sends?.[title] ?? 'full'

/** What the AI may read of an entry's blocks: the "always" ones, and everything not marked never. Empty blocks are left out. */
export function aiBlocks(e: HasBlocks): { always: string; visible: string; first: string } {
  const blocks = parseBlocks(e.full).filter(b => b.text && sendOf(e, b.title) !== 'never')
  return {
    always: blocks.filter(b => sendOf(e, b.title) === 'always').map(render).join('\n\n'),
    visible: blocks.map(render).join('\n\n'),
    first: blocks[0]?.text.split('\n\n')[0] ?? '',
  }
}

/** The full text without the blocks marked never (for everything sent to the AI). */
export const aiFull = (e: HasBlocks): string => aiBlocks(e).visible
