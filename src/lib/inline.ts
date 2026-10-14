// Italics and bold inside a paragraph, written the Markdown way in the scene's
// file: *italic*, **bold**, ***both***. Used by the editor, Page view and the exports.

export interface Run { t: string; i?: boolean; b?: boolean }

// Opening marker followed by a non-space, closing marker preceded by one, same line, no asterisk inside.
const INLINE = /\*\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*\*|\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*|\*(?!\s)([^*\n]+?)(?<!\s)\*/g

export interface Span { from: number; to: number; marker: number; i: boolean; b: boolean }

/** Where the styled spans are, with the width of their markers (1, 2 or 3 asterisks each side). */
export function inlineSpans(text: string): Span[] {
  const out: Span[] = []
  for (const m of text.matchAll(INLINE)) {
    const marker = m[1] !== undefined ? 3 : m[2] !== undefined ? 2 : 1
    out.push({ from: m.index!, to: m.index! + m[0].length, marker, i: marker !== 2, b: marker >= 2 })
  }
  return out
}

/** The paragraph as plain and styled runs, markers removed. */
export function parseInline(text: string): Run[] {
  const runs: Run[] = []
  let at = 0
  for (const s of inlineSpans(text)) {
    if (s.from > at) runs.push({ t: text.slice(at, s.from) })
    runs.push({ t: text.slice(s.from + s.marker, s.to - s.marker), i: s.i, b: s.b })
    at = s.to
  }
  if (at < text.length) runs.push({ t: text.slice(at) })
  return runs
}

export const stripInline = (text: string) => parseInline(text).map(r => r.t).join('')

/**
 * Cuts a paragraph in two (for a page break) without breaking a span: if the cut
 * falls inside italics or bold, the head closes it and the tail opens it again.
 */
export function balanceSplit(head: string, tail: string): [string, string] {
  let italic = false, bold = false
  for (const m of head.matchAll(/\*+/g)) {
    const n = m[0].length
    if (n === 1) italic = !italic
    else if (n === 2) bold = !bold
    else if (n === 3) { italic = !italic; bold = !bold }
  }
  const close = (bold ? '**' : '') + (italic ? '*' : '')
  const open = (italic ? '*' : '') + (bold ? '**' : '')
  return [head + close, open + tail]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The paragraph as HTML (EPUB, the shareable page): <em> and <strong>. */
export const inlineHtml = (text: string) =>
  parseInline(text).map(r => {
    let h = esc(r.t)
    if (r.i) h = `<em>${h}</em>`
    if (r.b) h = `<strong>${h}</strong>`
    return h
  }).join('')

/** The paragraph as Word runs (.docx), with italics and bold. */
export const inlineDocx = (text: string, escape: (s: string) => string) =>
  parseInline(text).map(r =>
    `<w:r>${r.i || r.b ? `<w:rPr>${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${escape(r.t)}</w:t></w:r>`).join('')
