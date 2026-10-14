// Numbers about a text, computed locally (zero tokens) for the Review side.
import { countWords } from './text'

/** Signs as French publishers count them: every character, spaces included, not line breaks. */
export const countSigns = (s: string) => s.replace(/\r?\n/g, '').length

export const feuillets = (signs: number) => signs / 1500

// Counting a whole book on every keystroke is wasteful: a scene is a new object
// only when it changed, so its counts are kept against the object itself.
const counted = new WeakMap<object, { words: number; signs: number }>()
export function sceneCounts(scene: { text: string }): { words: number; signs: number } {
  let c = counted.get(scene)
  if (!c) { c = { words: countWords(scene.text), signs: countSigns(scene.text) }; counted.set(scene, c) }
  return c
}
export function bookCounts(chapters: { scenes: { text: string }[] }[]): { words: number; signs: number } {
  let words = 0, signs = 0
  for (const c of chapters) for (const s of c.scenes) { const k = sceneCounts(s); words += k.words; signs += k.signs }
  return { words, signs }
}

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
