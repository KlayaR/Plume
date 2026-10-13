// Review reports in the spirit of AutoCrit: each report finds passages in the
// text (highlighted in the editor), counts them per 1,000 words or per sentence,
// and compares the rate with a target. Categories: pacing, dialogue, strong
// writing, word choice, repetition, readability. All local, zero tokens.
// The targets are Plume's estimates for published fiction, not measured norms.
import type { Book, Lang } from './types'
import {
  adverbs, CLICHES, CONJUNCTIONS, dialogue, echoes, FANCY_TAGS, FILLER_WORDS, FILTER_WORDS, paragraphs, passives,
  PLAIN_TAGS, phrases, readability, repeatedPhrases, repeatedStarts, sentences, STOPWORDS, TELLING_WORDS, words, type Finding,
} from './analysis'
import { foldText } from './text'
import { listWords, wordLists } from './voice'

export type Category = 'pacing' | 'dialogue' | 'strong' | 'choice' | 'repetition' | 'readability'

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'pacing', label: 'Pacing & momentum' },
  { id: 'dialogue', label: 'Dialogue' },
  { id: 'strong', label: 'Strong writing' },
  { id: 'choice', label: 'Word choice' },
  { id: 'repetition', label: 'Repetition' },
  { id: 'readability', label: 'Readability' },
]

/** How a report counts: per 1,000 words, or as a share of sentences / paragraphs / dialogue tags. */
type Unit = 'per1000' | 'sentences' | 'paragraphs' | 'tags'

export interface ReportDef {
  id: string
  category: Category
  label: string
  help: string
  unit: Unit
  /** Target (at most): per 1,000 words, or % of the unit. */
  target: number
  find: (text: string, lang: Lang, book: Book) => Finding[]
}

const firstWord = (s: string) => foldText((s.replace(/^[—–«“"\s]+/, '').match(/[\p{L}’'-]+/u) ?? [''])[0])

/** Dialogue tags: a speech verb right after a line of dialogue (« … », dit-il / "…," she said). */
function tags(text: string, lang: Lang, fancyOnly: boolean): Finding[] {
  const list = fancyOnly ? FANCY_TAGS[lang] : [...PLAIN_TAGS[lang], ...FANCY_TAGS[lang]]
  const out: Finding[] = []
  for (const d of dialogue(text)) {
    const end = Math.min(text.length, d.to + 60)
    for (const f of phrases(text.slice(d.from, end), list)) out.push({ from: d.from + f.from, to: d.from + f.to, note: f.note })
  }
  // A dash line and a quoted part inside it can both count the same tag.
  return out.filter((f, i) => out.findIndex(g => g.from === f.from) === i)
}

export const REPORTS: ReportDef[] = [
  // Pacing & momentum
  { id: 'slow', category: 'pacing', label: 'Slow paragraphs', unit: 'paragraphs', target: 12,
    help: 'Long blocks of narration with no dialogue: the pace drops. Break them up, or cut.',
    find: text => paragraphs(text).filter(p => words(p.p).length > 120 && !/[«“"—–]/.test(p.p)).map(p => ({ from: p.from, to: p.to })) },
  { id: 'long', category: 'pacing', label: 'Long sentences', unit: 'sentences', target: 5,
    help: 'Sentences over your longest-sentence rule (Settings → Voice).',
    find: (text, _l, book) => sentences(text).filter(s => s.words > book.meta.voice.rules.sentenceMaxWords).map(s => ({ from: s.from, to: s.to, note: `${s.words}` })) },
  { id: 'monotone', category: 'pacing', label: 'Same-length sentences', unit: 'sentences', target: 8,
    help: 'Four or more sentences in a row of about the same length: the rhythm goes flat.',
    find: text => {
      const ss = sentences(text)
      const out: Finding[] = []
      for (let i = 0; i + 3 < ss.length; i++) {
        const run = ss.slice(i, i + 4)
        const min = Math.min(...run.map(s => s.words)), max = Math.max(...run.map(s => s.words))
        if (max - min <= 3 && min > 3) { out.push({ from: run[0].from, to: run[3].to }); i += 3 }
      }
      return out
    } },
  // Dialogue
  { id: 'tags', category: 'dialogue', label: 'Showy dialogue tags', unit: 'tags', target: 25,
    help: 'Tags other than said / asked (murmured, retorted…). A few are fine; "said" disappears and lets the line speak.',
    find: (text, lang) => tags(text, lang, true) },
  { id: 'tagadverbs', category: 'dialogue', label: 'Adverbs in dialogue tags', unit: 'per1000', target: 0.5,
    help: '"she said softly": the adverb tells what the line should show.',
    find: (text, lang) => {
      const out: Finding[] = []
      const adv = adverbs(text, lang)
      for (const tg of tags(text, lang, false)) {
        const a = adv.find(x => x.from >= tg.to && x.from - tg.to < 30)
        if (a) out.push({ from: tg.from, to: a.to })
      }
      return out
    } },
  // Strong writing
  { id: 'adverbs', category: 'strong', label: 'Adverbs', unit: 'per1000', target: 8,
    help: 'Words in -ment / -ly. A stronger verb often does the job alone.',
    find: (text, lang) => adverbs(text, lang) },
  { id: 'passive', category: 'strong', label: 'Passive voice', unit: 'sentences', target: 3,
    help: '"The door was opened": who opened it? The active voice is more direct.',
    find: (text, lang) => passives(text, lang) },
  { id: 'telling', category: 'strong', label: 'Telling words', unit: 'per1000', target: 3,
    help: 'Emotions named (sad, afraid, anger) instead of shown through the body, actions and dialogue.',
    find: (text, lang) => phrases(text, TELLING_WORDS[lang]) },
  { id: 'filter', category: 'strong', label: 'Filter words', unit: 'per1000', target: 6,
    help: '"She saw the door open": the reader sees it through her. "The door opened" puts them in the scene.',
    find: (text, lang) => phrases(text, FILTER_WORDS[lang]) },
  { id: 'cliches', category: 'strong', label: 'Clichés', unit: 'per1000', target: 0.3,
    help: 'Worn phrases. Add your own to a word list in the bible.',
    find: (text, lang) => phrases(text, CLICHES[lang]) },
  // Word choice
  { id: 'filler', category: 'choice', label: 'Filler words', unit: 'per1000', target: 10,
    help: 'Just, really, very, suddenly, began to… Most can go.',
    find: (text, lang) => phrases(text, FILLER_WORDS[lang]) },
  { id: 'conjunctions', category: 'choice', label: 'Sentences opening on a conjunction', unit: 'sentences', target: 6,
    help: 'And, But, So… at the start of a sentence: fine now and then, a tic when frequent.',
    find: (text, lang) => sentences(text).filter(s => CONJUNCTIONS[lang].includes(firstWord(s.s))).map(s => ({ from: s.from, to: s.from + Math.min(s.s.length, 24) })) },
  { id: 'banned', category: 'choice', label: 'Your banned words', unit: 'per1000', target: 0,
    help: 'Words from the word lists in your bible.',
    find: (text, _l, book) => phrases(text, wordLists(book).flatMap(listWords)) },
  // Repetition
  { id: 'echoes', category: 'repetition', label: 'Echoes', unit: 'per1000', target: 12,
    help: 'The same word again within about 40 words.',
    find: (text, lang) => echoes(text, lang) },
  { id: 'phrases', category: 'repetition', label: 'Repeated phrases', unit: 'per1000', target: 1.5,
    help: 'Phrases of three to five words used more than once.',
    find: (text, lang) => repeatedPhrases(text, lang) },
  { id: 'starts', category: 'repetition', label: 'Repeated sentence starts', unit: 'sentences', target: 6,
    help: 'Sentences opening with the same word as the one before.',
    find: text => repeatedStarts(text) },
]

export type Status = 'good' | 'ok' | 'bad'

export interface ReportResult {
  def: ReportDef
  findings: Finding[]
  count: number
  rate: number
  status: Status
}

export interface Review {
  words: number
  sentences: number
  results: ReportResult[]
  readability: number
  avgSentence: number
  sentenceLengths: number[]
  dialogueShare: number
  overused: [string, number][]
  score: number
}

function rateOf(def: ReportDef, count: number, w: number, s: number, p: number, tg: number): number {
  switch (def.unit) {
    case 'per1000': return w ? (count / w) * 1000 : 0
    case 'sentences': return s ? (count / s) * 100 : 0
    case 'paragraphs': return p ? (count / p) * 100 : 0
    case 'tags': return tg ? (count / tg) * 100 : 0
  }
}

export function statusOf(rate: number, target: number): Status {
  if (rate <= target + 1e-9) return 'good'
  return rate <= Math.max(target * 1.6, target + 0.5) ? 'ok' : 'bad'
}

/** Words used far more often than the rest, with counts (shown under Repetition). */
export function overused(text: string, lang: Lang): [string, number][] {
  const ws = words(text)
  const counts = new Map<string, number>()
  for (const x of ws) {
    const w = foldText(x.w)
    if (w.length < 4 || STOPWORDS[lang].has(w)) continue
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  const min = Math.max(4, ws.length / 400)
  return [...counts].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1]).slice(0, 15)
}

/** Every report on a text, with an overall score out of 100. */
export function review(text: string, book: Book): Review {
  const lang = book.meta.language
  const ws = words(text).length
  const ss = sentences(text)
  const ps = paragraphs(text).length
  const tagCount = tags(text, lang, false).length
  const results = REPORTS.map(def => {
    const findings = def.find(text, lang, book)
    const rate = rateOf(def, findings.length, ws, ss.length, ps, tagCount)
    return { def, findings, count: findings.length, rate, status: statusOf(rate, def.target) }
  })
  const dlg = dialogue(text).reduce((sum, d) => sum + d.to - d.from, 0)
  const chars = text.replace(/\n/g, '').length
  const points = results.reduce((sum, r) => sum + (r.status === 'good' ? 1 : r.status === 'ok' ? 0.5 : 0), 0)
  return {
    words: ws,
    sentences: ss.length,
    results,
    readability: readability(text, lang),
    avgSentence: ss.length ? ss.reduce((a, s) => a + s.words, 0) / ss.length : 0,
    sentenceLengths: ss.map(s => s.words),
    dialogueShare: chars ? Math.min(1, dlg / chars) : 0,
    overused: overused(text, lang),
    score: Math.round((points / results.length) * 100),
  }
}

/** Every occurrence of one word (for the overused-words list). */
export const occurrences = (text: string, word: string): Finding[] => words(text).filter(x => foldText(x.w) === word).map(({ from, to }) => ({ from, to }))
