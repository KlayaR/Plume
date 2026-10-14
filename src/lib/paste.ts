// Pasting from Word, Google Docs or a web page: formatting is dropped except
// italic and bold (kept as *italic* and **bold**), paragraphs become one line
// each, and the typography is fixed for the book's language.
import type { Lang } from './types'
import { fixTypography } from './typography'

const SKIP = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'IMG', 'HEAD', 'TITLE', 'NOSCRIPT'])
const BLOCK = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TR', 'SECTION', 'ARTICLE', 'UL', 'OL'])

/** Marks around a span, with the spaces kept outside so the Markdown stays valid. */
export function wrapMarks(inner: string, mark: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner
}

function convert(n: Node, ctx: { i: boolean; b: boolean }): string {
  if (n.nodeType === 3) return (n.nodeValue ?? '').replace(/\s+/g, ' ')
  if (n.nodeType !== 1) return ''
  const el = n as HTMLElement
  const tag = el.tagName
  if (SKIP.has(tag)) return ''
  if (tag === 'BR') return '\n'
  const st = el.style
  const weight = (st?.fontWeight ?? '').toLowerCase()
  // Google Docs wraps the whole clipboard in <b style="font-weight:normal">.
  const bold = !/^H[1-6]$/.test(tag) && (tag === 'B' || tag === 'STRONG' ? !(weight === 'normal' || weight === '400') : weight === 'bold' || weight === 'bolder' || parseInt(weight, 10) >= 600)
  const italic = tag === 'I' || tag === 'EM' || (st?.fontStyle ?? '').toLowerCase() === 'italic'
  const next = { i: ctx.i || italic, b: ctx.b || bold }
  let inner = Array.from(el.childNodes).map(c => convert(c, next)).join('')
  if (bold && !ctx.b && italic && !ctx.i) inner = wrapMarks(inner, '***')
  else if (bold && !ctx.b) inner = wrapMarks(inner, '**')
  else if (italic && !ctx.i) inner = wrapMarks(inner, '*')
  return BLOCK.has(tag) ? `${inner}\n` : inner
}

/** The clipboard's HTML as Markdown-ish text, one paragraph per line. */
export function htmlToText(html: string): string {
  if (typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return convert(doc.body, { i: false, b: false })
}

/** Lines trimmed, blank ones gone, runs of spaces collapsed (non-breaking spaces are the typography's job). */
export function cleanLines(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t  ]+/g, ' ').split('\n').map(l => l.trim()).filter(Boolean).join('\n')
}

/**
 * What to insert for a paste. `lineBefore` is the text of the line up to the
 * caret, so a quote pasted mid-sentence opens or closes correctly.
 */
export function pasteText(html: string, plain: string, lang: Lang, lineBefore = ''): string {
  const fromHtml = html && /<[a-z][\s\S]*>/i.test(html) ? htmlToText(html) : ''
  const clean = cleanLines(fromHtml || plain)
  if (!clean) return ''
  const fixedBefore = fixTypography(lineBefore, lang)
  const whole = fixTypography(lineBefore + clean, lang)
  return whole.startsWith(fixedBefore) ? whole.slice(fixedBefore.length) : fixTypography(clean, lang)
}
