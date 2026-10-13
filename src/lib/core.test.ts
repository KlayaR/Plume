import { describe, expect, it } from 'vitest'
import { parseEntry, serializeEntry, parseScene, serializeScene, factApplies, parseFact } from './bible'
import { buildContext, buildMatcher, findMentions } from './context'
import { fixTypography, typingRule } from './typography'
import { lastWords, slugify } from './text'
import { allowedKinds, chapterLabels, enterStartsScene } from './chapters'
import { countSigns, textStats } from './stats'
import type { Book, Entry } from './types'
import { DEFAULT_AI, DEFAULT_VOICE } from './types'
import { adverbs, passives, echoes } from './analysis'
import { checkRules, expandVariables } from './voice'
import { review } from './review'
import { parseStoryTime } from './structures'
import { makeZip, readZip, utf8, fromUtf8 } from './zip'
import { toMarkdown } from './export'

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
