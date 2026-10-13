// Numbers about a text, computed locally (zero tokens) for the Review side.
import { countWords } from './text'

/** Signs as French publishers count them: every character, spaces included, not line breaks. */
export const countSigns = (s: string) => s.replace(/\r?\n/g, '').length

export const feuillets = (signs: number) => signs / 1500

export interface TextStats {
  words: number
  signs: number
  feuillets: number
  paragraphs: number
  sentences: number
  avgSentence: number
  longestSentence: number
  dialogueShare: number
}

export function textStats(text: string): TextStats {
  const paragraphs = text.split('\n').filter(l => l.trim())
  const sentences = (text.match(/[^.!?…\n]+[.!?…]+[»”"’)]*|[^.!?…\n]+$/gm) ?? []).map(s => s.trim()).filter(s => /\p{L}/u.test(s))
  const lengths = sentences.map(countWords)
  const dialogue = paragraphs.filter(l => /^\s*[—–-]/.test(l)).join('') + (text.match(/«[^»]*»|“[^”]*”/g) ?? []).join('')
  const signs = countSigns(text)
  return {
    words: countWords(text),
    signs,
    feuillets: feuillets(signs),
    paragraphs: paragraphs.length,
    sentences: sentences.length,
    avgSentence: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0,
    longestSentence: lengths.length ? Math.max(...lengths) : 0,
    dialogueShare: signs ? Math.min(1, countSigns(dialogue) / signs) : 0,
  }
}
