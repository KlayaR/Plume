// Capture lines: while drafting, a line that starts with :: leaves the text and
// goes where you can sort it out later (::idea, ::todo, ::bible Name: …, ::comment).
// The French words work too, whatever the language of the book.
import { foldText } from './text'

export type CaptureKind = 'idea' | 'todo' | 'bible' | 'comment'
export interface Capture { kind: CaptureKind; text: string; name?: string }

const WORDS = new Map<string, CaptureKind>([['idea', 'idea'], ['idee', 'idea'], ['todo', 'todo'], ['tache', 'todo'], ['bible', 'bible'], ['fiche', 'bible'], ['comment', 'comment'], ['commentaire', 'comment']])
// \s also covers the no-break spaces French typography puts before a colon.
const LINE = /^\s*:\s*:\s*(\p{L}+)(?:[\s:]+(.*))?$/u

/** The kind of capture this line starts, even before anything follows the word. */
export function captureKind(line: string): CaptureKind | null {
  const m = line.includes(':') ? LINE.exec(line) : null
  return (m && WORDS.get(foldText(m[1]))) ?? null
}

/** The capture on this line, once it says something. */
export function parseCapture(line: string): Capture | null {
  const kind = captureKind(line)
  const text = kind ? (LINE.exec(line)![2] ?? '').trim() : ''
  if (!kind || !text) return null
  if (kind !== 'bible') return { kind, text }
  const colon = text.indexOf(':')
  return colon < 0 ? { kind, name: text, text: '' } : { kind, name: text.slice(0, colon).trim(), text: text.slice(colon + 1).trim() }
}

/** What a ::comment pins to: the last sentence of the paragraph above the line at `lineFrom`. */
export function captureQuote(text: string, lineFrom: number): { quote: string; at: number } | null {
  const before = text.slice(0, lineFrom).trimEnd()
  const start = before.lastIndexOf('\n') + 1
  const para = before.slice(start)
  if (!para) return null
  const last = [...para.matchAll(/[.!?…]+(?:\s*[»”"’')])*\s+/g)].pop()
  let quote = last ? para.slice(last.index + last[0].length) : para
  if (quote.length < 8) quote = para
  if (quote.length > 200) quote = quote.slice(-200).trim()
  return { quote, at: start + para.lastIndexOf(quote) }
}
