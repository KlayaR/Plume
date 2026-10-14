import { describe, expect, it } from 'vitest'
import { parseEntry, serializeEntry, parseScene, serializeScene, factApplies, parseFact } from './bible'
import { buildContext, buildMatcher, findMentions } from './context'
import { autoCapitalRule, fixTypography, loneI, typingRule } from './typography'
import { pasteText, wrapMarks } from './paste'
import { matterPages, FRONT, BACK } from './matter'
import { checkBible } from './bibleCheck'
import { attention } from './attention'
import { beatFlags, beatTension } from './structures'
import { lastWords, locateQuote, slugify } from './text'
import { allowedKinds, chapterLabels, enterStartsScene } from './chapters'
import { countSigns, textStats } from './stats'
import type { Book, Entry, Scene } from './types'
import { DEFAULT_AI, DEFAULT_VOICE } from './types'
import { adverbs, passives, echoes } from './analysis'
import { checkRules, expandVariables } from './voice'
import { review } from './review'
import { parseStoryTime } from './structures'
import { makeZip, readZip, utf8, fromUtf8 } from './zip'
import { scenePositions, timeFlags } from './structures'
import { bookCounts, sceneCounts } from './stats'
import { darlingSpot, diffWords } from '../writing'
import { parseJSON } from '../ai'
import { chunks, kindOf, ltLanguage } from './languagetool'
import { balanceSplit, inlineHtml, parseInline, stripInline } from './inline'
import { splitManuscript } from '../library'
import { toHtml, toMarkdown } from './export'
import { matchRanges, replaceInText } from './find'
import { speakerStats } from './speakers'
import { nextToDo, progress, togglePass } from './revision'
import { compareSnap, makeSnap } from './snapshots'
import { referenceTargets, type Reference } from './references'

const entry = (over: Partial<Entry>): Entry => ({
  slug: 'x', type: 'character', path: 'bible/characters/x.md', name: 'X', aliases: [], include: 'auto',
  links: [], short: '', full: '', facts: [], extra: {}, ...over,
})

const elise = entry({ slug: 'elise', name: 'Élise Varenne', aliases: ['Élise', 'Lise', 'la Duchesse'], links: ['aube'], short: 'Young duchess.', full: 'Long portrait.', facts: [{ from: 3, to: 8, text: 'Carries Aube.' }, { from: 12, to: null, text: 'Blind in the left eye.' }] })
const aube = entry({ slug: 'aube', type: 'object', name: 'Aube', short: 'A silver sword.' })
const rose = entry({ slug: 'rose', name: 'Rose', aliases: ['Rose!'], short: 'The maid.' })
const maison = entry({ slug: 'maison-varenne', type: 'faction', name: 'Maison Varenne', short: 'Old family.' })
const varenne = entry({ slug: 'varenne', type: 'place', name: 'Varenne', short: 'A town.' })

describe('entry files', () => {
  it('round-trips an entry', () => {
    const e = { ...elise, path: 'bible/characters/elise.md' }
    const back = parseEntry(e.path, serializeEntry(e))
    expect(back).toEqual(e)
  })
  it('reads a hand-written file without sections as the full version', () => {
    const e = parseEntry('bible/places/port.md', '---\nname: Le Port\n---\nFog and gulls.\n')
    expect(e.type).toBe('place')
    expect(e.full).toBe('Fog and gulls.')
  })
  it('parses dated facts', () => {
    expect(parseFact('- [ch 12+] Blind.')).toEqual({ from: 12, to: null, text: 'Blind.' })
    expect(parseFact('- [ch 3-8] Has it.')).toEqual({ from: 3, to: 8, text: 'Has it.' })
    expect(parseFact('- [ch 5] Only then.')).toEqual({ from: 5, to: 5, text: 'Only then.' })
    expect(parseFact('- Always true.')).toEqual({ from: null, to: null, text: 'Always true.' })
    expect(factApplies({ from: 12, to: null, text: '' }, 5)).toBe(false)
    expect(factApplies({ from: 3, to: 8, text: '' }, 5)).toBe(true)
  })
  it('round-trips a scene', () => {
    const s = { id: 'a1', path: 'manuscript/c/s.md', title: 'Le bal', pov: 'elise', status: 'draft' as const, text: 'Il pleuvait.\n\nEncore.', place: null, lines: [], comments: [], extra: {} }
    expect(parseScene(s.path, serializeScene(s))).toEqual(s)
  })
})

describe('name detection', () => {
  const m = buildMatcher([elise, aube, rose, maison, varenne])
  const names = (t: string) => findMentions(t, m).map(x => x.slug)

  it('ignores accents and case, handles elision', () => {
    expect(names("Le regard d'Elise croisa celui de LISE.")).toEqual(['elise', 'elise'])
    expect(names('L’Aube brillait.')).toEqual(['aube'])
    expect(names("Élise's sword")).toEqual(['elise'])
  })
  it('matches whole words only', () => {
    expect(names('Lisette entra.')).toEqual([])
  })
  it('prefers the longest name', () => {
    expect(names('La Maison Varenne quitta Varenne.')).toEqual(['maison-varenne', 'varenne'])
  })
  it('respects exact-case aliases', () => {
    expect(names('Rose arriva avec une rose.')).toEqual(['rose'])
  })
  it('gives positions in the original text', () => {
    const t = 'Hier, Élise dormait.'
    const [hit] = findMentions(t, m)
    expect(t.slice(hit.from, hit.to)).toBe('Élise')
  })
})

describe('context', () => {
  const book: Book = {
    root: '',
    meta: { format: 1, title: 'Test', author: '', language: 'en', order: [], ai: { ...DEFAULT_AI }, voice: DEFAULT_VOICE, structure: { template: '', beats: [] }, loose: [], history: {}, goal: { book: 0, daily: 0 }, series: null, map: null, ignored: [] },
    entries: [elise, aube, rose, maison, varenne, entry({ slug: 'style', type: 'style', path: 'bible/style.md', name: 'Style guide', include: 'always', full: 'Past tense.' })],
    chapters: [],
  }
  const base = { book, chapter: 5, pov: null, action: 'continue' as const, instruction: '', before: '', selection: '', after: '', overrides: {} }

  it('picks mentioned entries short and follows links', () => {
    const b = buildContext({ ...base, before: 'Élise drew her blade.' })
    const p = Object.fromEntries(b.picked.map(x => [x.slug, x]))
    expect(p.elise.mode).toBe('short')
    expect(p.aube.reasons[0]).toBe('linked from Élise Varenne')
    expect(b.system).toContain('Past tense.')
    expect(b.system).toContain('Carries Aube.')
    expect(b.system).not.toContain('Blind')
  })
  it('sends the full version for the POV and for @-mentions', () => {
    expect(buildContext({ ...base, pov: 'elise' }).picked.find(p => p.slug === 'elise')!.mode).toBe('full')
    const b = buildContext({ ...base, instruction: 'Show @Rose in the doorway' })
    expect(b.picked.find(p => p.slug === 'rose')!.mode).toBe('full')
  })
  it('honours drop and short overrides', () => {
    const b = buildContext({ ...base, pov: 'elise', overrides: { elise: 'short', aube: 'drop' } })
    expect(b.picked.find(p => p.slug === 'elise')!.mode).toBe('short')
    expect(b.system).not.toContain('silver sword')
  })
  it('cuts linked entries first when over budget', () => {
    const tight = { ...book, meta: { ...book.meta, ai: { ...book.meta.ai, bibleBudget: 20 } } }
    const b = buildContext({ ...base, book: tight, before: 'Élise.' })
    expect(b.picked.find(p => p.slug === 'aube')!.dropped).toBe(true)
  })
  it('keeps the system prompt identical across actions', () => {
    const a = buildContext({ ...base, before: 'Élise.' })
    const r = buildContext({ ...base, action: 'rewrite', before: 'Élise.', selection: 'She ran.' })
    expect(a.system).toBe(r.system)
  })
})

describe('typography', () => {
  it('fixes French text', () => {
    expect(fixTypography('- Tu viens ? dit-il. "Oui"... C\'est : non!', 'fr'))
      .toBe('— Tu viens ? dit-il. « Oui »… C’est : non !')
  })
  it('gives dialogue dashes a no-break space', () => {
    expect(fixTypography('Il dit :\n— Vous êtes pâle.', 'fr')).toBe('Il dit :\n— Vous êtes pâle.')
  })
  it('leaves times alone', () => {
    expect(fixTypography('À 10:30 précises', 'fr')).toBe('À 10:30 précises')
  })
  it('is idempotent', () => {
    const once = fixTypography('"Bon !" dit-elle.', 'fr')
    expect(fixTypography(once, 'fr')).toBe(once)
  })
  it('fixes English text', () => {
    expect(fixTypography('"Don\'t," she said -- \'twas late...', 'en')).toBe('“Don’t,” she said — ‘twas late…')
  })
  it('applies rules as you type', () => {
    expect(typingRule('fr', 'Tu viens ', '?')).toEqual({ remove: 1, insert: ' ?' })
    expect(typingRule('fr', 'Il dit ', '"')).toEqual({ remove: 0, insert: '« ' })
    expect(typingRule('fr', '-', ' ')).toEqual({ remove: 1, insert: '— ' })
    expect(typingRule('fr', 'À 10', ':')).toBeNull()
    expect(typingRule('en', 'He said ', '"')).toEqual({ remove: 0, insert: '“' })
    expect(typingRule('en', 'Wait..', '.')).toEqual({ remove: 2, insert: '…' })
  })
})

describe('chapters', () => {
  it('numbers chapters around a prologue and an epilogue', () => {
    const labels = chapterLabels([{ kind: 'prologue' }, { kind: 'chapter' }, { kind: 'chapter' }, { kind: 'epilogue' }], 'fr')
    expect(labels.map(l => l.label)).toEqual(['Prologue', 'Chapitre 1', 'Chapitre 2', 'Épilogue'])
    expect(labels.map(l => l.number)).toEqual([0, 1, 2, 3])
  })
  it('allows a prologue first and an epilogue last only', () => {
    expect(allowedKinds(0, 3)).toEqual(['chapter', 'prologue'])
    expect(allowedKinds(1, 3)).toEqual(['chapter'])
    expect(allowedKinds(2, 3)).toEqual(['chapter', 'epilogue'])
  })
  it('starts a new scene on Enter at an empty last line only', () => {
    expect(enterStartsScene('Il pleuvait.\n', 13)).toBe(true)
    expect(enterStartsScene('Il pleuvait.', 12)).toBe(false)
    expect(enterStartsScene('Il pleuvait.\n', 5)).toBe(false)
    expect(enterStartsScene('\n', 1)).toBe(false)
  })
})

describe('stats', () => {
  it('counts signs without line breaks', () => {
    expect(countSigns('Il pleut.\nEncore !')).toBe(17)
  })
  it('measures sentences and dialogue', () => {
    const s = textStats('Il entra. La salle était vide.\n— Qui est là ?\n— Moi.')
    expect(s.paragraphs).toBe(3)
    expect(s.sentences).toBe(4)
    expect(s.dialogueShare).toBeGreaterThan(0.3)
  })
})

describe('text helpers', () => {
  it('cuts the last words at a word start', () => {
    expect(lastWords('one two three four', 2)).toBe('three four')
  })
  it('slugifies French names', () => {
    expect(slugify('Élise Varenne')).toBe('elise-varenne')
  })
})

describe('voice', () => {
  it('reads facts dated in a book of the series', () => {
    expect(parseFact('- [b2 ch 3+] Queen.')).toEqual({ from: 3, to: null, book: 2, text: 'Queen.' })
    expect(factApplies({ from: 3, to: null, book: 2, text: '' }, 1, 3)).toBe(true)
    expect(factApplies({ from: 3, to: 5, book: 2, text: '' }, 4, 3)).toBe(false)
  })
  it('finds French adverbs but not nouns in -ment', () => {
    const t = 'Il entra lentement dans l’appartement, un moment, puis sourit doucement.'
    expect(adverbs(t, 'fr').map(f => t.slice(f.from, f.to))).toEqual(['lentement', 'doucement'])
  })
  it('finds passives but not être + state verbs', () => {
    expect(passives('La porte fut ouverte par le vent.', 'fr').length).toBe(1)
    expect(passives('Elle est allée au bal.', 'fr').length).toBe(0)
    expect(passives('The door was opened by the wind.', 'en').length).toBe(1)
  })
  it('flags echoes', () => {
    expect(echoes('Le regard de Marc croisa son regard.', 'fr').length).toBe(1)
  })
  const vbook: Book = {
    root: '', chapters: [],
    meta: { format: 1, title: 'T', author: 'A', language: 'en', order: [], ai: { ...DEFAULT_AI }, voice: { ...DEFAULT_VOICE, tense: 'present tense' }, structure: { template: '', beats: [] }, loose: [], history: {}, goal: { book: 0, daily: 0 }, series: null, map: null, ignored: [] },
    entries: [entry({ slug: 'ai-isms', type: 'wordlist', name: 'AI-isms', full: 'tapestry\ndelve' })],
  }
  it('fills variables', () => {
    expect(expandVariables('In {book.tense}, avoid {list.AI-isms}.', { book: vbook })).toBe('In present tense, avoid tapestry, delve.')
  })
  it('scores a proposal', () => {
    const c = Object.fromEntries(checkRules('A rich tapestry of light. He walked slowly and quietly and softly.', vbook).map(x => [x.id, x.ok]))
    expect(c.banned).toBe(false)
    expect(c.adverbs).toBe(false)
  })
})

describe('review', () => {
  const book: Book = {
    root: '', chapters: [],
    meta: { format: 1, title: 'T', author: '', language: 'fr', order: [], ai: { ...DEFAULT_AI }, voice: DEFAULT_VOICE, structure: { template: '', beats: [] }, loose: [], history: {}, goal: { book: 0, daily: 0 }, series: null, map: null, ignored: [] },
    entries: [],
  }
  it('flags adverbs, filter words and showy tags', () => {
    const r = review('Il marchait lentement. Elle vit la porte. Elle sentit la peur.\n— Viens, murmura-t-elle doucement.', book)
    const by = Object.fromEntries(r.results.map(x => [x.def.id, x.count]))
    expect(by.adverbs).toBe(2)
    expect(by.filter).toBe(2)
    expect(by.tags).toBe(1)
    expect(by.tagadverbs).toBe(1)
    expect(r.score).toBeGreaterThanOrEqual(0)
  })
  it('reads story time', () => {
    expect(parseStoryTime('Jour 3, 22h30')).toEqual({ day: 3, minutes: 22 * 60 + 30 })
    expect(parseStoryTime('Day 2, night')).toEqual({ day: 2, minutes: 23 * 60 })
    expect(parseStoryTime('le lendemain')).toBe(null)
  })
})

describe('export', () => {
  it('round-trips a zip', async () => {
    const zip = await makeZip([{ name: 'a.txt', data: utf8('Bonjour '.repeat(50)) }, { name: 'mimetype', data: utf8('x'), store: true }])
    const files = await readZip(zip)
    expect(fromUtf8(files.get('a.txt')!)).toBe('Bonjour '.repeat(50))
    expect(fromUtf8(files.get('mimetype')!)).toBe('x')
  })
  it('writes Markdown without placeholders', () => {
    const book: Book = {
      root: '', entries: [],
      meta: { format: 1, title: 'Le Livre', author: 'A', language: 'fr', order: [], ai: { ...DEFAULT_AI }, voice: DEFAULT_VOICE, structure: { template: '', beats: [] }, loose: [], history: {}, goal: { book: 0, daily: 0 }, series: null, map: null, ignored: [] },
      chapters: [{ id: 'c', folder: 'c', kind: 'chapter', title: 'Le bal', notes: '', scenes: [{ id: 's', path: 'p', title: 'S', pov: null, status: 'draft', text: 'Il vint. ⟦à écrire⟧\nElle partit.', extra: {} }] }],
    }
    const md = toMarkdown(book, { format: 'md', layout: 'book', titlePage: true, sceneBreak: '* * *' })
    expect(md).toContain('## Chapitre 1 : Le bal')
    expect(md).not.toContain('⟦')
  })
})

describe('French checks on real prose', () => {
  it('catches a short passive participle and ignores adjectives', () => {
    expect(passives('Elle a été vue par le garde.', 'fr').length).toBe(1)
    expect(passives('Le ciel était gris et la porte était fermée.', 'fr').map(f => 'x').length).toBe(1) // fermée only
    expect(passives('Il est né à Lyon. Elle est partie vite.', 'fr').length).toBe(0)
  })
  it('does not call être forms echoes', () => {
    expect(echoes('Les lettres furent brûlées. Les murs furent détruits.', 'fr').length).toBe(0)
  })
})

describe('plan helpers', () => {
  const mk = (scenes: { id: string; time?: string; place?: string; pov?: string; text?: string }[]): Book => ({
    root: '', entries: [],
    meta: { format: 1, title: 'T', author: '', language: 'en', order: [], ai: { ...DEFAULT_AI }, voice: DEFAULT_VOICE, structure: { template: '', beats: [] }, loose: [], history: {}, goal: { book: 0, daily: 0 }, series: null, map: null, ignored: [] },
    chapters: [{ id: 'c', folder: 'c', kind: 'chapter', title: '', notes: '', scenes: scenes.map(x => ({ id: x.id, path: x.id, title: x.id, pov: x.pov ?? null, status: 'draft' as const, text: x.text ?? 'word '.repeat(10), time: x.time, place: x.place ?? null, extra: {} })) }],
  })
  it('flags story time running backwards', () => {
    const flags = timeFlags(mk([{ id: 'a', time: 'Day 3, 22:00' }, { id: 'b', time: 'Day 2' }]), false)
    expect(flags.map(f => f.sceneId)).toEqual(['b'])
    expect(timeFlags(mk([{ id: 'a', time: 'Day 1, 10:00' }, { id: 'b', time: 'Day 1, 09:00' }]), false).length).toBe(1)
    expect(timeFlags(mk([{ id: 'a', time: 'Day 1' }, { id: 'b', time: 'Day 2' }]), false).length).toBe(0)
  })
  it('places scenes by their share of the words', () => {
    const pos = scenePositions(mk([{ id: 'a', text: 'a b c d' }, { id: 'b', text: 'a b c d' }]))
    expect(Math.round(pos.get('b')!.start)).toBe(50)
  })
  it('caches counts per scene object', () => {
    const sc = { text: 'un deux trois' }
    expect(sceneCounts(sc).words).toBe(3)
    expect(bookCounts([{ scenes: [sc, { text: 'quatre' }] }]).words).toBe(4)
  })
})

describe('writing tools', () => {
  it('puts a darling back where it came from', () => {
    const d = { id: 'x', sceneId: 's', sceneTitle: '', text: ' et pleura', before: 'Elle ouvrit la porte', after: '. Puis elle sortit', date: '' }
    const now = 'Elle ouvrit la porte. Puis elle sortit dans la nuit.'
    expect(darlingSpot(now, d)).toBe('Elle ouvrit la porte'.length)
    expect(darlingSpot('rien à voir', d)).toBe(null)
  })
  it('compares two versions word by word', () => {
    const parts = diffWords('Il marchait vite dans la rue.', 'Il marchait lentement dans la rue.')
    expect(parts.filter(p => p.kind === 'del').map(p => p.text.trim())).toEqual(['vite'])
    expect(parts.filter(p => p.kind === 'add').map(p => p.text.trim())).toEqual(['lentement'])
  })
  it('reads a JSON reply wrapped in prose or a code fence', () => {
    expect(parseJSON<number[]>('Voici :\n```json\n[1, 2]\n```')).toEqual([1, 2])
    expect(parseJSON<{ a: number }>('ok {"a": 1} fin')).toEqual({ a: 1 })
    expect(parseJSON('rien')).toBe(null)
  })
})

describe('import', () => {
  it('splits a manuscript into chapters and scenes', () => {
    const r = splitManuscript([
      { text: 'Mon Roman', heading: true }, { text: 'Chapitre 1 : Le bal', heading: false },
      { text: 'Il vint.', heading: false }, { text: '* * *', heading: false }, { text: 'Elle partit.', heading: false },
      { text: 'Chapitre 2', heading: false }, { text: 'La nuit.', heading: false },
    ], 'x')
    expect(r.title).toBe('Mon Roman')
    expect(r.chapters.length).toBe(2)
    expect(r.chapters[0].scenes).toEqual(['Il vint.', 'Elle partit.'])
    expect(r.chapters[0].title).toBe('Le bal')
  })
})

describe('facts from Claude', () => {
  it('parses facts with and without a chapter', () => {
    expect(parseFact('- [ch 3+] Blind.')).toEqual({ from: 3, to: null, text: 'Blind.' })
    expect(parseFact('Paul is the twin.')).toEqual({ from: null, to: null, text: 'Paul is the twin.' })
  })
})

describe('LanguageTool client', () => {
  it('cuts a long text at paragraph breaks and keeps the places', () => {
    const text = ('Un paragraphe de test. '.repeat(20) + '\n').repeat(10)
    const parts = chunks(text, 1000)
    expect(parts.length).toBeGreaterThan(3)
    expect(parts.map(p => p.text).join('')).toBe(text)
    parts.forEach(p => expect(text.slice(p.offset, p.offset + p.text.length)).toBe(p.text))
    expect(chunks('court').length).toBe(1)
  })
  it('sorts issues into spelling, grammar and style', () => {
    const rule = (id: string, issueType: string, cat: string) => ({ message: '', offset: 0, length: 1, rule: { id, issueType, category: { id: cat } } })
    expect(kindOf(rule('MORFOLOGIK_RULE_EN_US', 'misspelling', 'TYPOS'))).toBe('spell')
    expect(kindOf(rule('HE_VERB_AGR', 'grammar', 'GRAMMAR'))).toBe('grammar')
    expect(kindOf(rule('FRENCH_WHITESPACE', 'typographical', 'TYPOGRAPHY'))).toBe('style')
    // French rules have categories like CAT_GRAMMAIRE and no issue type
    expect(kindOf(rule('ILS_ONT', 'uncategorized', 'CAT_HOMONYMES_PARONYMES'))).toBe('grammar')
    expect(kindOf(rule('ACCORD_R_PERS_VERBE', 'uncategorized', 'CAT_GRAMMAIRE'))).toBe('grammar')
    expect(kindOf(rule('FR_SPELLING_RULE', 'misspelling', 'TYPOS'))).toBe('spell')
  })
  it('uses the book language', () => {
    expect(ltLanguage('fr', 'en-GB')).toBe('fr')
    expect(ltLanguage('en', 'en-GB')).toBe('en-GB')
    expect(ltLanguage('en', '')).toBe('en-US')
  })
})

describe('italics and bold', () => {
  it('reads *italic*, **bold** and ***both***', () => {
    expect(parseInline('Il *pensa* que **non** et ***jamais***.')).toEqual([
      { t: 'Il ' }, { t: 'pensa', i: true, b: false }, { t: ' que ' }, { t: 'non', i: false, b: true }, { t: ' et ' }, { t: 'jamais', i: true, b: true }, { t: '.' },
    ])
    expect(stripInline('un *mot* seul')).toBe('un mot seul')
  })
  it('leaves stray asterisks alone', () => {
    expect(stripInline('5 * 3 * 2')).toBe('5 * 3 * 2')
    expect(stripInline('* * *')).toBe('* * *')
  })
  it('keeps a span whole across a page break', () => {
    const [head, tail] = balanceSplit('Il *se dit que', 'rien ne changerait* jamais.')
    expect(head).toBe('Il *se dit que*')
    expect(tail).toBe('*rien ne changerait* jamais.')
    expect(balanceSplit('Rien *ici* du tout', 'la suite')).toEqual(['Rien *ici* du tout', 'la suite'])
  })
  it('writes <em> and <strong> and escapes the rest', () => {
    expect(inlineHtml('A & *B* <i>')).toBe('A &amp; <em>B</em> &lt;i&gt;')
  })
  it('does not count the markers as signs', () => {
    expect(countSigns('un *mot*')).toBe(countSigns('un mot'))
  })
})

const scene = (id: string, text: string, over: Partial<Scene> = {}): Scene => ({ id, path: `manuscript/c/${id}.md`, title: id, pov: null, status: 'draft', text, extra: {}, ...over })
const bookOf = (scenes: Scene[], entries: Entry[] = [], language: 'en' | 'fr' = 'en'): Book => ({
  root: '', entries,
  meta: { format: 1, title: 'T', author: 'A', language, order: [], ai: { ...DEFAULT_AI }, voice: DEFAULT_VOICE, structure: { template: '', beats: [] }, loose: [], history: {}, goal: { book: 0, daily: 0 }, series: null, map: null, ignored: [] },
  chapters: [{ id: 'c', folder: 'c', kind: 'chapter', title: 'One', notes: '', scenes }],
})

describe('find and replace', () => {
  const o = { query: 'elise', caseSensitive: false, whole: false, regex: false }
  it('ignores case and accents unless asked', () => {
    expect(matchRanges('Voici \u00c9lise et elise.', o)).toHaveLength(2)
    expect(matchRanges('Voici \u00c9lise et elise.', { ...o, caseSensitive: true })).toHaveLength(1)
  })
  it('matches whole words only on request', () => {
    expect(matchRanges('cat concat cat', { ...o, query: 'cat', whole: true })).toHaveLength(2)
    expect(matchRanges('cat concat cat', { ...o, query: 'cat' })).toHaveLength(3)
  })
  it('replaces everywhere and counts', () => {
    expect(replaceInText('a b a', { ...o, query: 'a' }, 'z')).toEqual({ text: 'z b z', count: 2 })
  })
  it('treats an invalid regex as no match', () => {
    expect(matchRanges('abc', { ...o, query: '(', regex: true })).toEqual([])
  })
})

describe('scene frontmatter', () => {
  it('keeps tension and revision passes', () => {
    const s = parseScene('manuscript/c/a.md', '---\nid: a\ntitle: A\ntension: 7\npasses:\n  - structure\n---\nText')
    expect(s.tension).toBe(7)
    expect(s.passes).toEqual(['structure'])
    expect(parseScene(s.path, serializeScene(s))).toEqual(s)
  })
  it('leaves tension unset when absent', () => {
    expect(parseScene('manuscript/c/a.md', '---\nid: a\n---\nText').tension).toBeUndefined()
  })
})

describe('speakers', () => {
  const rose2 = entry({ slug: 'rose', name: 'Rose', voice: { register: '', sentences: '', tic: 'my dear', gesture: '', never: 'whatever', inner: '', lines: '' } })
  const lise = entry({ slug: 'lise', name: 'Lise', aliases: [] })
  it('gives each line to the name beside it, counts tics and flags forbidden words', () => {
    const text = '\u201cWhere, my dear?\u201d said Rose.\n\u201cNorth,\u201d Lise answered.\n\u201cWhatever you say.\u201d Rose shrugged.'
    const s = speakerStats(text, bookOf([], [rose2, lise]))
    const r = s.find(x => x.slug === 'rose')!
    expect(r.lines).toBe(2)
    expect(s.find(x => x.slug === 'lise')!.lines).toBe(1)
    expect(r.tics).toEqual([{ phrase: 'my dear', count: 1 }])
    expect(r.violations.map(v => v.phrase)).toEqual(['whatever'])
    expect(Math.round(s.reduce((n, x) => n + x.share, 0))).toBe(100)
  })
  it('returns nothing without characters', () => {
    expect(speakerStats('\u201cHi,\u201d said Rose.', bookOf([]))).toEqual([])
  })
})

describe('revision passes', () => {
  it('walks pass by pass, scene by scene', () => {
    const a = scene('a', 'x', { passes: ['structure'] }), b = scene('b', 'y')
    const book = bookOf([a, b])
    expect(nextToDo(book)).toMatchObject({ scene: { id: 'b' }, pass: { id: 'structure' } })
    expect(progress(book)[0]).toMatchObject({ done: 1, total: 2 })
    const done = bookOf([{ ...a, passes: ['structure', 'line', 'proof'] }, { ...b, passes: ['structure', 'line', 'proof'] }])
    expect(nextToDo(done)).toBeNull()
  })
  it('toggles a pass', () => {
    expect(togglePass(undefined, 'line')).toEqual(['line'])
    expect(togglePass(['line', 'proof'], 'line')).toEqual(['proof'])
  })
})

describe('snapshots', () => {
  it('lists changed, new and removed scenes', () => {
    const before = bookOf([scene('a', 'one two'), scene('b', 'three')])
    const snap = makeSnap(before, 'v1')
    expect(snap.words).toBe(3)
    const now = bookOf([scene('a', 'one two more'), scene('c', 'fresh')])
    const changes = compareSnap(now, snap)
    expect(changes.map(c => [c.id, c.kind, c.delta])).toEqual([['a', 'changed', 1], ['c', 'new', 1], ['b', 'removed', -1]])
    expect(compareSnap(before, snap)).toEqual([])
  })
})

describe('reference books', () => {
  const ref = (over: Partial<Reference>): Reference => ({ id: 'r', name: 'R', lang: 'en', words: 1000, on: true, rates: { adverbs: 4 }, avgSentence: 14, dialogueShare: 0.3, readability: 70, ...over })
  it('averages the references in use for the language', () => {
    const t = referenceTargets([ref({}), ref({ id: 's', rates: { adverbs: 8 }, avgSentence: 18 }), ref({ id: 'off', on: false, avgSentence: 99 }), ref({ id: 'fr', lang: 'fr', avgSentence: 99 })], 'en')!
    expect(t.count).toBe(2)
    expect(t.rates.adverbs).toBe(6)
    expect(t.avgSentence).toBe(16)
  })
  it('is null without references', () => {
    expect(referenceTargets([ref({ on: false })], 'en')).toBeNull()
  })
})

describe('html export', () => {
  it('makes one page with a table of contents and inline emphasis', () => {
    const html = toHtml(bookOf([scene('a', 'He said *no*.\n\nSecond.')]), { format: 'html', layout: 'book', titlePage: true, sceneBreak: '* * *' })
    expect(html).toContain('<title>T</title>')
    expect(html).toContain('href="#c1"')
    expect(html).toContain('<em>no</em>')
  })
})

describe('automatic capitals', () => {
  it('capitalises a line start and a sentence start', () => {
    expect(autoCapitalRule('en', '', 'a')).toEqual({ remove: 0, insert: 'A' })
    expect(autoCapitalRule('en', 'He ran. ', 'a')).toEqual({ remove: 0, insert: 'A' })
    expect(autoCapitalRule('en', 'He ran. \u201c', 'a')).toEqual({ remove: 0, insert: 'A' })
    expect(autoCapitalRule('fr', '\u2014\u00a0', '\u00e9')).toEqual({ remove: 0, insert: '\u00c9' })
  })
  it('leaves abbreviations, initials, ellipses and question marks alone', () => {
    expect(autoCapitalRule('en', 'Ask Mr. ', 'a')).toBeNull()
    expect(autoCapitalRule('en', 'J. ', 'r')).toBeNull()
    expect(autoCapitalRule('en', 'Well.. ', 'a')).toBeNull()
    expect(autoCapitalRule('fr', '\u2014\u00a0Tu viens ? ', 'd')).toBeNull()
    expect(autoCapitalRule('en', 'He ', 'a')).toBeNull()
  })
  it('turns a lone i into I in English only', () => {
    expect(loneI('en', 'then i', ' ')).toBe(true)
    expect(loneI('en', 'a hi', ' ')).toBe(false)
    expect(loneI('en', 'then i', 'x')).toBe(false)
    expect(loneI('fr', 'then i', ' ')).toBe(false)
  })
})

describe('paste cleaning', () => {
  it('makes one paragraph per line and fixes the typography', () => {
    expect(pasteText('', 'He said "no".\r\n\r\n  Then   left...', 'en')).toBe('He said \u201cno\u201d.\nThen left\u2026')
  })
  it('closes a quote pasted after an opening one', () => {
    expect(pasteText('', 'no"', 'en', 'He said \u201c')).toBe('no\u201d')
  })
  it('keeps the spaces outside emphasis marks', () => {
    expect(wrapMarks(' word ', '*')).toBe(' *word* ')
    expect(wrapMarks('   ', '*')).toBe('   ')
  })
})

describe('front and back matter', () => {
  const base = bookOf([scene('a', 'Text.')])
  const withMatter: Book = { ...base, meta: { ...base.meta, matter: { dedication: 'For R.', about: 'Born somewhere.\nWrites.', copyright: '  ' } }, chapters: [{ ...base.chapters[0], part: 'Part One' }] }
  it('keeps only filled pages, headed at the back only', () => {
    expect(matterPages(withMatter, FRONT)).toEqual([{ key: 'dedication', heading: '', paras: ['For R.'] }])
    expect(matterPages(withMatter, BACK)).toEqual([{ key: 'about', heading: 'About the author', paras: ['Born somewhere.', 'Writes.'] }])
  })
  it('puts them and the part title in the exports', () => {
    const o = { format: 'md' as const, layout: 'book' as const, titlePage: true, sceneBreak: '* * *' }
    const md = toMarkdown(withMatter, o)
    expect(md.indexOf('For R.')).toBeLessThan(md.indexOf('# Part One'))
    expect(md.indexOf('# Part One')).toBeLessThan(md.indexOf('## Chapter 1'))
    expect(md.trim().endsWith('Writes.')).toBe(true)
    const html = toHtml(withMatter, { ...o, format: 'html' })
    expect(html).toContain('<h2 class="part">Part One</h2>')
    expect(html).toContain('id="about"')
  })
})

describe('bible AI check', () => {
  const kara = entry({ slug: 'kara', name: 'Kara', full: 'A thief of the docks.', include: 'auto' })
  const dax = entry({ slug: 'dax', name: 'Dax', short: 'Her fence.', full: 'Sells what she steals.' })
  const clone = entry({ slug: 'kara-2', name: 'Kara Voss', aliases: ['Kara'], short: 'Another.' })
  const three = ['Kara met Dax.', 'Kara and Dax ran.', 'Dax paid Kara.'].map((t, i) => scene('s' + i, t, { pov: 'kara' }))
  const book = bookOf(three, [kara, dax, clone])
  const kinds = (b: Book) => checkBible(b).issues.map(i => i.kind)
  it('finds what makes the AI context worse', () => {
    const k = kinds(book)
    expect(k).toContain('no-short')
    expect(k).toContain('no-voice')
    expect(k).toContain('no-knows')
    expect(k).toContain('duplicate')
    expect(k).toContain('unlinked')
  })
  it('is quiet about a tidy bible', () => {
    const tidy = bookOf(three, [
      entry({ slug: 'kara', name: 'Kara', short: 'A thief.', full: 'A thief.', knows: 'The docks.', links: ['dax'], voice: { register: 'curt', sentences: '', tic: '', gesture: '', never: '', inner: '', lines: '' } }),
      entry({ slug: 'dax', name: 'Dax', type: 'creature', short: 'Her fence.', full: 'Her fence.' }),
    ])
    expect(checkBible(tidy).issues.filter(i => i.severity === 'warn')).toEqual([])
  })
  it('warns about a short, lower-case alias', () => {
    expect(kinds(bookOf(three, [entry({ slug: 'kara', name: 'Kara', short: 'x', aliases: ['the'] })]))).toContain('common-alias')
  })
})

describe('private notes and new entry types', () => {
  it('keeps notes in the file and out of the AI context', () => {
    const e = { ...entry({ slug: 'orb', type: 'magic', path: 'bible/magic/orb.md', name: 'Orb', short: 'Glows.' }), notes: 'secret plan' }
    const back = parseEntry(e.path, serializeEntry(e))
    expect(back.notes).toBe('secret plan')
    expect(back.type).toBe('magic')
    const b = buildContext({ book: bookOf([], [e]), chapter: 1, pov: null, action: 'continue', instruction: '', before: 'The Orb glowed.', selection: '', after: '', overrides: {} })
    expect(b.system).toContain('Glows.')
    expect(b.system).not.toContain('secret plan')
  })
})

describe('needs attention', () => {
  it('lists empty scenes, scenes without a POV and unplaced beats', () => {
    const base = bookOf([scene('a', 'Written.'), scene('b', '')], [entry({ slug: 'kara', name: 'Kara' })])
    const book = { ...base, meta: { ...base.meta, structure: { template: 'x', beats: [{ name: 'Climax', at: 90, note: '', sceneId: null }] } } }
    const kinds = attention(book).map(a => a.kind)
    expect(kinds).toEqual(expect.arrayContaining(['empty', 'no-pov', 'beats-unplaced', 'next-pass']))
  })
})

describe('beats and tension', () => {
  it('reads whether a beat peaks or breathes', () => {
    expect(beatTension('Climax')).toBe('high')
    expect(beatTension('Tout est perdu')).toBe('high')
    expect(beatTension('Ordinary world')).toBe('low')
    expect(beatTension('Final image')).toBe('low')
    expect(beatTension('Debate')).toBeNull()
  })
  it('flags a calm scene on a climax', () => {
    const base = bookOf([scene('a', 'x', { tension: 2 }), scene('b', 'y', { tension: 9 })])
    const book = { ...base, meta: { ...base.meta, structure: { template: 'x', beats: [
      { name: 'Climax', at: 90, note: '', sceneId: 'a' }, { name: 'Opening image', at: 0, note: '', sceneId: 'b' }] } } }
    expect(beatFlags(book).map(f => [f.beat, f.kind])).toEqual([['Climax', 'calm'], ['Opening image', 'tense']])
  })
})

describe('comment anchors', () => {
  it('picks the repeat nearest to where the comment was', () => {
    const text = 'no. yes. no. yes. no.'
    expect(locateQuote(text, 'no', 0)).toBe(0)
    expect(locateQuote(text, 'no', 12)).toBe(9)
    expect(locateQuote(text, 'no', 20)).toBe(18)
    expect(locateQuote(text, 'maybe', 0)).toBe(-1)
  })
})
