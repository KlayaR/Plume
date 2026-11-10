import { boardMove, boardNeighbour } from './board'
import { hunksOf } from './hunks'
import { waitingInBook } from './waiting'
import { describe, expect, it } from 'vitest'
import { locate } from '../edit'
import { parseEntry, serializeEntry, parseScene, serializeScene, factApplies, parseFact } from './bible'
import { buildContext, buildMatcher, findMentions, outlineLines, ownShare, proseSamples, sceneWords, systemPrompt } from './context'
import { autoCapitalRule, fixTypography, loneI, typingRule } from './typography'
import { pasteText, wrapMarks } from './paste'
import { matterPages, FRONT, BACK } from './matter'
import { checkBible } from './bibleCheck'
import { jumpItems, rankJump } from './quickjump'
import { aiBlocks, joinBlocks, parseBlocks, toBlocks } from './blocks'
import { tidy } from '../contextMenu'
import { readCard, sceneText } from './outline'
import { addVersion, cardPatch, cardSpec, foundationText, hasPlan, seriesText, unwrittenPlaces, mergeCards, outlineRules, readChapterProposal, readRevision, revisionChanges, revisionOrder, revisionText, turningPointsText, versionOf, versionProposal } from './outline'
import { sessionOf, worthShowing } from './session'
import { addDirection, ordered, togglePin, type Direction } from './directions'
import { EMPTY_RATE, learnCall, learnWindow, shareOf } from './windowCost'
import { exampleFiles } from './example'
import { HELP, searchHelp } from './help'
import { chatBody, DEFAULT_PRESETS, httpMessage, isLimitError, presetFor, readEvent, readModels, searchModels, splitSSE } from './presets'
import { attention } from './attention'
import { beatFlags, beatTension } from './structures'
import { lastWords, locateQuote, slugify } from './text'
import { allowedKinds, chapterLabels, enterStartsScene } from './chapters'
import { countSigns, textStats } from './stats'
import type { Book, Entry, Scene } from './types'
import { DEFAULT_AI, DEFAULT_VOICE, ENTRY_TYPES, FAMILIES, VOICE_TYPES, familyOf } from './types'
import { adverbs, passives, echoes, sentences } from './analysis'
import { backupsToRemove, versionsToRemove } from './backups'
import { aiTells, checkRules, expandVariables } from './voice'
import { review, reviewChecks, topProblems } from './review'
import { applyFixes, fixGuard, fixRequest, placeFixes } from './fixes'
import { EditorState } from '@codemirror/state'
import { changesField, setChanges } from '../editor/marks'
import { parseStoryTime } from './structures'
import { makeZip, readZip, utf8, fromUtf8 } from './zip'
import { bibleMarkdown, markdownToDocx, toDocx } from './export'
import { outlineMarkdown } from './outline'
import { arcsOf, beatChapter, bufferOf, hookFlags, maskSystem, mergeStats, readBox, releaseDates, releaseStreak, statConflicts, statsAt, systemBoxes, textKey, threadStates, volumesOf, weekReleases } from './serial'
import { chapterTitleFor, royalRoadHtml, volumeBook } from './export'
import { serialStorySoFar } from './context'
import type { Chapter } from './types'
import { DEFAULT_SERIAL } from './types'
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
import { compareEntries, comparePlan, compareSnap, makeSnap, planText } from './snapshots'
import { changedKeys, undoStack } from './undo'
import { addField, entryNamed, fieldLines, hasField, removeField, renamedValues, renameField, setFieldSend, sortEntries } from './fields'
import { renderEntry } from './context'
import { placeComments, stackCards } from './comments'
import { forwardOnly, wordStart, type DraftBack } from './draft'
import { CELL, boundsOf, boxBetween, connect, copyTiles, freeSpot, layerTiles, linkEnds, makeSheet, makeTile, moveTiles, overlaps, pasteTiles, readSheets, removeLink, removeTiles, resizeTile, snap, tilesInBox } from './grid'
import { beatMove, chapterAsBeats, outlineRows, pastedLines, plainChapter, plainScene, stockSceneTitle } from './outliner'
import { referenceTargets, type Reference } from './references'
import { applyLink, isKnownName, linkMatches, linkQuery } from './links'
import { keysOf, keysOwner, keysProblem } from './shortcuts'
import { actionItems } from './quickjump'
import { captureKind, captureQuote, parseCapture } from './captures'

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
    expect(b.message).toContain('Carries Aube.')
    expect(b.message).not.toContain('Blind')
  })
  it('never sends what an entry becomes later in the series with prose', () => {
    const later = { ...book, meta: { ...book.meta, series: { path: '../S', index: 1 } }, entries: book.entries.map(e => (e.slug === 'elise' ? { ...e, later: 'Book 3: queen’s daughter.' } : e)) }
    const b = buildContext({ ...base, book: later, pov: 'elise' })
    expect(b.message).not.toContain('queen’s daughter')
    expect(b.system).not.toContain('queen’s daughter')
  })
  it('sends the fields set up for the type of the entry', () => {
    const fielded = { ...book, meta: { ...book.meta, fields: { character: [{ name: 'Âge' }, { name: 'Rôle', send: 'always' as const }] } }, entries: book.entries.map(e => (e.slug === 'elise' ? { ...e, fields: { Âge: '27', Rôle: 'duchesse' } } : e)) }
    const short = buildContext({ ...base, book: fielded, before: 'Élise drew her blade.' }).message
    expect(short).toContain('Rôle : duchesse')
    expect(short).not.toContain('Âge : 27')
    expect(buildContext({ ...base, book: fielded, pov: 'elise' }).message).toContain('Âge : 27')
  })
  it('sends the full version for the POV and for @-mentions', () => {
    expect(buildContext({ ...base, pov: 'elise' }).picked.find(p => p.slug === 'elise')!.mode).toBe('full')
    const b = buildContext({ ...base, instruction: 'Show @Rose in the doorway' })
    expect(b.picked.find(p => p.slug === 'rose')!.mode).toBe('full')
  })
  it('honours drop and short overrides', () => {
    const b = buildContext({ ...base, pov: 'elise', overrides: { elise: 'short', aube: 'drop' } })
    expect(b.picked.find(p => p.slug === 'elise')!.mode).toBe('short')
    expect(b.message).not.toContain('silver sword')
  })
  it('sends the cast, the place and the names on the plan card when writing the scene', () => {
    const scene = { id: 'w1', path: 'manuscript/c/w.md', title: 'Flight', pov: 'elise', status: 'draft' as const, text: '', note: 'They flee towards the Maison Varenne.', beats: ['Rose opens the gate.'], cast: ['Élise', 'Rose'], place: 'varenne', lines: [], comments: [], extra: {} }
    const b = buildContext({ ...base, action: 'scene', pov: 'elise', scene })
    const p = Object.fromEntries(b.picked.map(x => [x.slug, x]))
    expect(p.rose.mode).toBe('full')
    expect(p.rose.reasons).toContain('in the scene')
    expect(p.varenne.reasons).toContain('place of the scene')
    expect(p['maison-varenne'].dropped).toBe(false)
    expect(p.elise.reasons).toEqual(['POV'])
    // A rewrite only reads the passage.
    const r = buildContext({ ...base, action: 'rewrite', selection: 'She ran.', scene })
    expect(r.picked.some(x => x.slug === 'rose' || x.slug === 'varenne')).toBe(false)
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
  it('keeps the system prompt identical across scenes, POVs and mentions, so the cache serves it', () => {
    const a = buildContext({ ...base, before: 'Élise.', pov: 'elise' })
    const b = buildContext({ ...base, before: 'Rose ran.', pov: null, chapter: 5 })
    expect(a.system).toBe(b.system)
    expect(a.system).not.toContain('<entry ')
    expect(a.message).toContain('<bible>')
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
  // The twelve sentences of the November 2026 audit: no passive, no adverb in any of them.
  const clean = 'Elle s’était levée avant l’aube. Le ciel était bleu, presque blanc au-dessus des toits. Marc était petit pour un garde, mais têtu. Il était apparu à la grille sans un bruit. Un haussement d’épaules, un froncement de sourcils : rien d’autre. Le battement de son cœur couvrait le claquement des sabots. Elle s’était mise à courir. Le vieux était décédé l’hiver dernier. Un frémissement parcourut les feuilles, puis un chuchotement. Il s’était approché du mur. Elle était montée sur le banc. Ils s’étaient tus.'
  it('finds no passive in pronominal verbs, être verbs and adjectives', () => {
    expect(passives(clean, 'fr').map(f => clean.slice(f.from, f.to))).toEqual([])
    expect(passives('La porte fut ouverte par le vent.', 'fr').length).toBe(1)
  })
  it('takes a -ment word after an article or a possessive for a noun', () => {
    expect(adverbs(clean, 'fr')).toEqual([])
    const t = 'Il avançait lentement, avec un étonnement sincère, puis s’arrêta brusquement.'
    expect(adverbs(t, 'fr').map(f => t.slice(f.from, f.to))).toEqual(['lentement', 'brusquement'])
  })
  it('keeps a line of dialogue and its tag, and a title, in one sentence', () => {
    expect(sentences('— Tu viens ? demanda-t-il.').length).toBe(1)
    expect(sentences('M. Dupont attend. Il pleut.').map(s => s.s)).toEqual(['M. Dupont attend.', 'Il pleut.'])
    expect(sentences('He looked at me. Then he left.').length).toBe(2)
    expect(sentences('Tu viens ?\n— Non.').length).toBe(2)
  })
  it('does not count a name said twice as an echo', () => {
    const t = 'Marc ouvrit la porte. Marc ne dit rien.'
    expect(echoes(t, 'fr', 40, new Set(['marc'])).length).toBe(0)
    expect(echoes(t, 'fr').length).toBe(1)
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
  it('keeps only the chapter being changed, and compares only that chapter', () => {
    const before = bookOf([scene('a', 'one two')])
    before.chapters.push({ ...before.chapters[0], id: 'other', scenes: [scene('z', 'elsewhere')] })
    const snap = makeSnap(before, 'v1', [before.chapters[0].id])
    expect(snap.scenes.map(s => s.id)).toEqual(['a'])
    expect(snap.entries).toBeUndefined()
    const now = bookOf([scene('a', 'one two')])
    now.chapters.push({ ...now.chapters[0], id: 'other', scenes: [scene('z', 'changed'), scene('y', 'new')] })
    expect(compareSnap(now, snap)).toEqual([])
    expect(comparePlan(now, snap)).toEqual([])
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
    expect(b.message).toContain('Glows.')
    expect(b.message).not.toContain('secret plan')
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

describe('model presets', () => {
  const or = { id: 'r1', name: 'Cheap writer', backend: 'openrouter' as const, model: 'deepseek/deepseek-chat', effort: 'low' as const }
  it('finds the preset an action stands for', () => {
    expect(presetFor({ model: 'sonnet', effort: 'low' }, DEFAULT_PRESETS)?.id).toBe('writing')
    expect(presetFor({ model: 'opus', effort: 'high' }, DEFAULT_PRESETS)?.id).toBe('deep')
    expect(presetFor({ model: 'haiku', effort: 'high' }, DEFAULT_PRESETS)).toBeNull()
    expect(presetFor({ model: 'sonnet', effort: 'low', preset: 'r1' }, [...DEFAULT_PRESETS, or])).toBe(or)
    expect(presetFor({ model: 'sonnet', effort: 'low', preset: 'gone' }, DEFAULT_PRESETS)?.id).toBe('writing')
  })
  it('recognises a used-up plan', () => {
    expect(isLimitError('Usage limit reached: resets at 5pm')).toBe(true)
    expect(isLimitError("You've hit your weekly limit")).toBe(true)
    expect(isLimitError('Claude is not signed in.')).toBe(false)
    expect(isLimitError(undefined)).toBe(false)
  })
})

describe('OpenRouter streaming', () => {
  it('cuts events across chunks and reads text, comments, errors and the end', () => {
    const a = splitSSE(': OPENROUTER PROCESSING\n\ndata: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"del')
    expect(a.events).toHaveLength(2)
    expect(readEvent(a.events[0])).toEqual({})
    expect(readEvent(a.events[1])).toEqual({ text: 'Hel' })
    const b = splitSSE(a.rest + 'ta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n')
    expect(readEvent(b.events[0])).toEqual({ text: 'lo' })
    expect(readEvent(b.events[1])).toEqual({ done: true })
    expect(readEvent('data: {"error":{"message":"No credits"}}')).toEqual({ error: 'No credits' })
  })
  it('builds the request and explains failures', () => {
    expect(chatBody('m/x', 'Rules', 'Hi').messages).toEqual([{ role: 'system', content: 'Rules' }, { role: 'user', content: 'Hi' }])
    expect(chatBody('m/x', '  ', 'Hi').messages).toHaveLength(1)
    expect(httpMessage(402, '')).toContain('no credit')
    expect(httpMessage(500, '{"error":{"message":"Boom"}}')).toBe('OpenRouter: Boom')
  })
  it('reads and searches the model list', () => {
    const list = readModels({ data: [
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', context_length: 64000, pricing: { prompt: '0.0000003', completion: '0.0000012' } },
      { id: 'anthropic/claude-sonnet', name: 'Claude Sonnet', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' } },
    ] })
    expect(list.map(m => m.id)).toEqual(['anthropic/claude-sonnet', 'deepseek/deepseek-chat'])
    expect(list[1].promptPrice).toBeCloseTo(0.3)
    expect(searchModels(list, 'claude sonnet')).toHaveLength(1)
    expect(searchModels(list, '')).toHaveLength(2)
    expect(readModels(null)).toEqual([])
  })
})

describe('quick jump', () => {
  const book = bookOf([scene('a', 'x', { title: 'The ball' }), scene('b', 'y', { title: 'Escape' })], [entry({ slug: 'elise', name: 'Elise Varenne', aliases: ['Lise'] }), entry({ slug: 'ball-room', name: 'Ballroom', type: 'place' })])
  it('finds entries and scenes, names first', () => {
    const items = jumpItems(book)
    expect(rankJump(items, 'ball').map(i => i.label)).toEqual(['Ballroom', 'The ball'])
    expect(rankJump(items, 'lise').map(i => i.id)).toEqual(['elise'])
    expect(rankJump(items, 'ESCAPE')[0].kind).toBe('scene')
    expect(rankJump(items, 'zzz')).toEqual([])
    expect(rankJump(items, '').every(i => i.kind === 'scene')).toBe(true)
  })
})

describe('entry blocks', () => {
  const full = 'Overview line.\n\n### Appearance\nTall, scarred.\n\n### Secrets\nShe is the heir.\n\n### Empty'
  it('splits on headings and joins back', () => {
    const b = parseBlocks(full)
    expect(b.map(x => x.title)).toEqual(['', 'Appearance', 'Secrets', 'Empty'])
    expect(b[1].text).toBe('Tall, scarred.')
    expect(joinBlocks(b)).toBe(full)
    expect(parseBlocks('')).toEqual([])
  })
  it('keeps never-blocks away from the AI and sends always-blocks with the short version', () => {
    const e = { full, sends: { Secrets: 'never' as const, Appearance: 'always' as const } }
    const a = aiBlocks(e)
    expect(a.visible).toContain('Tall, scarred.')
    expect(a.visible).not.toContain('heir')
    expect(a.visible).not.toContain('Empty')
    expect(a.always).toBe('### Appearance\nTall, scarred.')
    expect(a.first).toBe('Overview line.')
  })
  it('builds the AI context from them', () => {
    const e = entry({ slug: 'kara', name: 'Kara', short: 'A thief.', full, sends: { Secrets: 'never', Appearance: 'always' } })
    const book = bookOf([], [e])
    const base = { book, chapter: 1, pov: null, action: 'continue' as const, instruction: '', before: 'Kara ran.', selection: '', after: '', overrides: {} }
    const short = buildContext(base).message
    expect(short).toContain('Tall, scarred.')
    expect(short).not.toContain('heir')
    const withFull = buildContext({ ...base, pov: 'kara' }).message
    expect(withFull).toContain('Overview line.')
    expect(withFull).not.toContain('heir')
  })
  it('keeps the choices and tags in the entry file', () => {
    const e = { ...entry({ slug: 'kara', name: 'Kara', path: 'bible/characters/kara.md', full }), sends: { Secrets: 'never' as const }, tags: ['thieves', 'act 1'] }
    const back = parseEntry(e.path, serializeEntry(e))
    expect(back.sends).toEqual({ Secrets: 'never' })
    expect(back.tags).toEqual(['thieves', 'act 1'])
  })
  it('keeps a character rank and drops an unknown one', () => {
    const e = { ...entry({ slug: 'kara', name: 'Kara', path: 'bible/characters/kara.md' }), rank: 'secondary' as const }
    const text = serializeEntry(e)
    expect(text).toContain('rank: secondary')
    expect(parseEntry(e.path, text).rank).toBe('secondary')
    const odd = parseEntry(e.path, text.replace('rank: secondary', 'rank: hero'))
    expect(odd.rank).toBeUndefined()
    expect(odd.extra.rank).toBeUndefined()
  })
})

describe('context menu helper', () => {
  it('drops empty groups and doubled separators', () => {
    const out = tidy([{ separator: true }, { label: 'A' }, false, { separator: true }, { separator: true }, { label: 'B' }, null, { separator: true }])
    expect(out.map(i => i.label ?? '-')).toEqual(['A', '-', 'B'])
  })
})

describe('help', () => {
  it('has the same number of lines in both languages and finds topics by word', () => {
    for (const h of HELP) expect(h.lines.fr.length).toBe(h.lines.en.length)
    expect(searchHelp('esc discard', 'en').map(h => h.id)).toContain('claude')
    expect(searchHelp('rejette', 'fr').map(h => h.id)).toContain('claude')
    expect(searchHelp('', 'en')).toHaveLength(HELP.length)
    expect(searchHelp('zzzzzz', 'en')).toEqual([])
  })
})

describe('bible families', () => {
  it('puts every entry type in one family or in the voice materials', () => {
    for (const { type } of ENTRY_TYPES) {
      const n = FAMILIES.filter(f => f.types.includes(type)).length + (VOICE_TYPES.includes(type) ? 1 : 0)
      expect(n, type).toBe(1)
    }
    expect(familyOf('creature')).toBe('things')
    expect(familyOf('wordlist')).toBeNull()
  })
})

describe('review top problems', () => {
  it('keeps the reports furthest above target, worst first', () => {
    const r = (id: string, rate: number, target: number, status: 'good' | 'ok' | 'bad') => ({ def: { id } as never, findings: [], count: 1, rate, target, fromRef: false, status })
    const top = topProblems([r('a', 1, 2, 'good'), r('b', 3, 2, 'ok'), r('c', 10, 2, 'bad'), r('d', 5, 2, 'bad'), r('e', 2.5, 2, 'ok')])
    expect(top.map(x => x.def.id)).toEqual(['c', 'd', 'b'])
  })
})

describe('daily comfort', () => {
  it('measures a session and ignores a glance', () => {
    const s = sessionOf(1000, 1640, 0, 52 * 60000)
    expect(s.words).toBe(640)
    expect(s.minutes).toBe(52)
    expect(worthShowing(s)).toBe(true)
    expect(worthShowing(sessionOf(1000, 1000, 0, 60000))).toBe(false)
  })
  it('keeps pinned directions and the last few others', () => {
    let list: Direction[] = []
    for (let i = 0; i < 9; i++) list = addDirection(list, `dir ${i}`)
    expect(list).toHaveLength(6)
    expect(list[0].text).toBe('dir 8')
    list = togglePin(list, 'dir 3')
    for (let i = 10; i < 20; i++) list = addDirection(list, `dir ${i}`)
    expect(list.some(d => d.text === 'dir 3' && d.pinned)).toBe(true)
    expect(ordered(list)[0].text).toBe('dir 3')
    expect(addDirection(list, '  dir   19 ')[0].text).toBe('dir 19')
  })
  it('learns what a token costs of the window, and stays quiet until sure', () => {
    let r = EMPTY_RATE
    r = learnWindow(r, { used: 0.1, resetsAt: 1 })
    expect(shareOf(r, 1000)).toBeNull()
    for (let i = 0; i < 3; i++) { r = learnCall(r, 10000); r = learnWindow(r, { used: 0.1 + 0.02 * (i + 1), resetsAt: 1 }) }
    expect(shareOf(r, 10000)).toBeCloseTo(0.02)
    expect(learnWindow(r, { used: 0, resetsAt: 2 }).pending).toBe(0)
  })
  it('ships an example book whose files parse', () => {
    for (const lang of ['fr', 'en'] as const) {
      const files = exampleFiles(lang)
      const order = JSON.parse(files['plume.json']).order as { folder: string; scenes: string[] }[]
      for (const c of order) for (const sc of c.scenes) expect(files[`manuscript/${c.folder}/${sc}`], sc).toBeDefined()
      for (const [rel, text] of Object.entries(files)) if (rel.startsWith('bible/')) expect(parseEntry(rel, text).name, rel).toBeTruthy()
    }
  })
})

describe('quality per token', () => {
  it('spots AI tells only when they become a habit', () => {
    const one = 'It was not fear, but something colder. She walked on.'
    expect(aiTells(one, 'en')).toEqual([])
    const habit = 'It was not fear, but anger. He was not sad, but tired. She ran. She fell. She rose.'
    expect(aiTells(habit, 'en').map(x => x.kind)).toEqual(['contrast', 'openers'])
    expect(aiTells('Il avança — lentement — puis — enfin — s’arrêta.', 'fr').map(x => x.kind)).toEqual(['dashes'])
    expect(aiTells('— Viens, dit-elle.\n— Non.', 'fr')).toEqual([])
    expect(aiTells('Cold, wet and dark. Red, gold and black. Slow, sure and quiet.', 'en').map(x => x.kind)).toContain('triads')
  })
  it('takes samples of the author\'s own prose, never from drafts, Claude\'s text or the current chapter', () => {
    const long = (w: string) => Array.from({ length: 200 }, () => w).join(' ')
    const mine = { ...scene('a', long('mine')), status: 'done' as const }
    const claude = { ...scene('b', long('claude')), status: 'done' as const, extra: { aiWords: 150 } }
    const draft = scene('c', long('draft'))
    const book = bookOf([mine, claude, draft], [])
    expect(ownShare(claude)).toBe(0.75)
    const s = proseSamples(book, 99).join(' ')
    expect(s).toContain('mine')
    expect(s).not.toContain('claude')
    expect(s).not.toContain('draft')
    expect(proseSamples(book, 1)).toEqual([])
  })
  it('sends the scenes you marked as your voice first, even Claude’s or a draft, and never those you unmarked', () => {
    const long = (w: string) => Array.from({ length: 200 }, () => w).join(' ')
    const mine = { ...scene('a', long('mine')), status: 'done' as const, voiceRef: false }
    const claude = { ...scene('b', long('claude')), status: 'done' as const, extra: { aiWords: 150 }, voiceRef: true }
    const draft = { ...scene('c', long('draft')), voiceRef: true }
    const s = proseSamples(bookOf([mine, claude, draft], []), 1)
    expect(s[0]).toContain('claude')
    expect(s.join(' ')).toContain('draft')
    expect(s.join(' ')).not.toContain('mine')
  })
  it('marks the system prompt for caching on Claude models through OpenRouter', () => {
    const body = chatBody('anthropic/claude-sonnet-5.5', 'Rules', 'Hi')
    expect(body.messages[0].content).toEqual([{ type: 'text', text: 'Rules', cache_control: { type: 'ephemeral' } }])
    expect(chatBody('openai/gpt-x', 'Rules', 'Hi').messages[0].content).toBe('Rules')
  })
})

describe('drafts in blocks', () => {
  it('cuts Claude\'s labelled lists and objects into blocks, and leaves blocks alone', () => {
    const list = 'Jasper\'s mate.\n\n- **Appearance:** Tiny, black hair.\n- **Gift:** Visions\nthat shift.'
    expect(toBlocks(list)).toBe('Jasper\'s mate.\n\n### Appearance\nTiny, black hair.\n\n### Gift\nVisions\nthat shift.')
    expect(toBlocks({ Role: 'Seer', Secrets: '', History: 'Asylum.' })).toBe('### Role\nSeer\n\n### History\nAsylum.')
    const done = '### Role\nSeer\n\n### History\nAsylum.'
    expect(toBlocks(done)).toBe(done)
    expect(toBlocks('**Never** say never.')).toBe('**Never** say never.')
  })
  it('flags an entry whose full version is a list in one block', () => {
    const e = entry({ slug: 'alice', name: 'Alice', full: '- **Appearance:** Tiny.\n- **Gift:** Visions.\n- **Personality:** Warm.' })
    expect(checkBible(bookOf([], [e])).issues.some(i => i.kind === 'one-block' && i.slug === 'alice')).toBe(true)
  })
})

describe('scene boundaries', () => {
  it('shows the scenes around this one for continuity and keeps the reply inside it', () => {
    const s1 = scene('s1', 'Jasper watched the rain.', { note: 'Jasper wants a calm morning.' })
    const s2 = scene('s2', '', { note: 'Alice tells him a new girl will change everything.' })
    const book = bookOf([s1, s2], [])
    const b = buildContext({ book, chapter: 1, pov: null, action: 'continue', instruction: '', before: s1.text, selection: '', after: '', overrides: {}, scene: s1 })
    expect(b.message).toContain('<next_scene title="s2">\nAlice tells him')
    expect(b.message).toContain('<scope>')
    expect(b.message).not.toContain('<previous_scene title')
    const c = buildContext({ book, chapter: 1, pov: null, action: 'continue', instruction: '', before: '', selection: '', after: '', overrides: {}, scene: s2 })
    expect(c.message).toContain('<previous_scene title="s1">\nJasper watched the rain.')
    const r = buildContext({ book, chapter: 1, pov: null, action: 'rewrite', instruction: '', before: '', selection: 'x', after: '', overrides: {}, scene: s1 })
    expect(r.message).not.toContain('<scope>')
  })
  it('gives a scene written from its plan the whole chapter so far, instead of the previous scene’s end', () => {
    const s1 = scene('s1', 'Jasper watched the rain. Then the bell rang.', { note: 'Jasper wants a calm morning.' })
    const s2 = scene('s2', '', { note: 'Alice tells him a new girl will change everything.' })
    const book = bookOf([s1, s2], [])
    const b = buildContext({ book, chapter: 1, pov: null, action: 'scene', instruction: '', before: '', selection: '', after: '', overrides: {}, scene: s2 })
    expect(b.message).toContain('<chapter_so_far>\nJasper watched the rain. Then the bell rang.\n</chapter_so_far>')
    expect(b.message).not.toContain('<previous_scene title')
  })
})

describe('writing from the plan', () => {
  it('shares the chapter length between its scenes, as a guide', () => {
    const one = bookOf([scene('a', '', { note: 'Jasper wants a calm morning.' })], [])
    expect(sceneWords(one, 'a')).toEqual([3000, 4500])
    const three = bookOf([scene('a', ''), scene('b', ''), scene('c', '')], [])
    expect(sceneWords(three, 'b')).toEqual([1000, 1500])
    const b = buildContext({ book: one, chapter: 1, pov: null, action: 'scene', instruction: '', before: '', selection: '', after: '', overrides: {}, scene: one.chapters[0].scenes[0] })
    expect(b.message).toContain('between about 3000 and 4500 words')
    expect(b.message).toContain('Jasper wants a calm morning.')
    expect(b.message).toContain('<scope>')
  })
})

describe('chapter craft when writing from the plan', () => {
  it('opens and lands the chapter only in the scenes that hold its opening and end', () => {
    const book = bookOf([scene('a', '', { note: 'Get past the guard.' }), scene('b', '', { note: 'The vault.' })], [])
    const run = (id: string) => buildContext({ book, chapter: 1, pov: null, action: 'scene', instruction: '', before: '', selection: '', after: '', overrides: {}, scene: book.chapters[0].scenes.find(s => s.id === id)! }).message
    expect(run('a')).toContain('This scene opens the chapter')
    expect(run('a')).toContain('the chapter goes on after it')
    expect(run('b')).toContain('This scene ends the chapter')
    expect(run('b')).not.toContain('This scene opens the chapter')
    expect(run('b')).toContain('“yes, but…”')
  })
})

describe('scorecard from the review', () => {
  it('flags the same simile construction used again and again', () => {
    const t = 'It went the way a stone goes. He moved the way a cat moves. She smiled the way the sea does. They left the way it ends.'
    expect(aiTells(t, 'en').map(x => x.kind)).toContain('similes')
    expect(aiTells('It went the way a stone goes. Then he left.', 'en').map(x => x.kind)).not.toContain('similes')
  })
  it('flags the French habits of ", et il" and "comme on", never a single use', () => {
    const kinds = (t: string) => aiTells(t, 'fr').map(x => x.kind)
    const link = 'Hester prit la feuille, et elle la déchira. Marlowe se leva, et il sortit. Priya posa la fiole, et elle se tut.'
    expect(kinds(link)).toContain('pronouns')
    // Every occurrence is quoted, so Claude doesn't have to look for the others.
    expect(aiTells(link, 'fr').find(x => x.kind === 'pronouns')?.quotes).toHaveLength(3)
    expect(aiTells(link, 'fr').find(x => x.kind === 'pronouns')?.quotes[0]).toContain('et elle la')
    expect(checkRules(link, bookOf([], [], 'fr')).find(c => c.id === 'tells')?.fix).toContain('et il sortit')
    expect(kinds('Hester prit la feuille, et il sortit.')).not.toContain('pronouns')
    expect(aiTells(link.replace(/et elle/g, 'and she').replace(/et il/g, 'and he'), 'en').map(x => x.kind)).not.toContain('pronouns')
    expect(kinds('Elle lut comme on lit un acte. Il attendit comme on attend un train.')).toContain('comparisons')
    expect(kinds('Elle lut comme on lit un acte. Il attendit.')).not.toContain('comparisons')
  })
  it('turns the reports furthest from target into fixes with quotes, for long enough passages', () => {
    const book = bookOf([], [])
    expect(reviewChecks('Too short.', book)).toEqual([])
    const long = Array.from({ length: 40 }, () => 'He was very really quite slowly walking and he was very really quite slowly talking.').join(' ')
    const checks = reviewChecks(long, book)
    expect(checks.length).toBeGreaterThan(0)
    expect(checks.length).toBeLessThanOrEqual(3)
    expect(checks[0].fix).toContain('« ')
    // A pass on a whole scene takes every report well over target, not those your rules already check.
    const every = reviewChecks(long, book, { every: true, say: s => s.toUpperCase() })
    const bad = review(long, book).results.filter(r => r.status === 'bad' && !['long', 'adverbs', 'passive', 'banned'].includes(r.def.id))
    expect(every.map(c => c.id).sort()).toEqual(bad.map(r => `review-${r.def.id}`).sort())
    expect(every[0].fix).toContain(every[0].label.toUpperCase())
  })
})

describe('fixing what is flagged', () => {
  const nb = ' ', nn = ' '
  it('places replacements on their words, whatever spaces and apostrophes Claude copied', () => {
    const text = `Elle prit l’acte${nn}! Il sortit${nb}: rien. Il sortit encore.`
    const { fixes, missed } = placeFixes(text, [
      { find: 'Elle prit l\'acte !', replace: 'Elle saisit l’acte !', why: 'a' },
      { find: 'Il sortit', replace: 'Il partit' },
      { find: 'Il sortit', replace: 'Il fila' },
      { find: 'mots absents', replace: 'x' },
      { find: '', replace: 'y' },
    ], 'fr')
    expect(missed).toBe(1)
    expect(fixes.map(f => text.slice(f.from, f.to))).toEqual([`Elle prit l’acte${nn}!`, 'Il sortit', 'Il sortit'])
    // Never on top of another fix, and the second "Il sortit" goes to the second place.
    expect(fixes[1].to).toBeLessThanOrEqual(fixes[2].from)
    expect(fixes[0].insert).toBe(`Elle saisit l’acte${nn}!`)
    expect(applyFixes(text, fixes)).toBe(`Elle saisit l’acte${nn}! Il partit${nb}: rien. Il fila encore.`)
  })
  it('keeps the other tracked changes on their words when one is accepted', () => {
    const doc = 'Elle partit, et elle rit. Il sortit, et il but.'
    const changes = [
      { id: 'a', from: 0, to: 25, insert: 'Elle partit et rit.', why: '' },
      { id: 'b', from: 26, to: 47, insert: 'Il sortit et but.', why: '' },
    ]
    const state = EditorState.create({ doc, extensions: [changesField] }).update({ effects: setChanges.of(changes) }).state
    const after = state.update({ changes: { from: 0, to: 25, insert: changes[0].insert }, effects: setChanges.of(changes.slice(1)) }).state
    const [left] = after.field(changesField)
    expect(after.doc.sliceString(left.from, left.to)).toBe('Il sortit, et il but.')
  })
  it('flags a misspelt name, not a small word of a name opening a sentence', () => {
    const book = bookOf([], [entry({ slug: 'p', type: 'place', name: 'Élise sous le Pont' })], 'fr')
    const names = (t: string) => review(t, book).results.find(r => r.def.id === 'names')!.count
    expect(names('Sous la fontaine, rien.')).toBe(0)
    expect(names('Il vit Elise sur le pont.')).toBe(1)
  })
  it('drops a replacement that changes nothing', () => {
    expect(placeFixes('Il sortit.', [{ find: 'Il sortit', replace: 'Il sortit' }], 'fr').fixes).toEqual([])
  })
  it('refuses fixes that amount to a rewrite, not in short scenes', () => {
    const text = Array.from({ length: 300 }, (_, i) => `mot${i}`).join(' ')
    const words = text.split(' ')
    const small = placeFixes(text, [{ find: words.slice(0, 10).join(' '), replace: 'dix mots remplacés par quelques autres' }], 'fr').fixes
    expect(fixGuard(text, small).ok).toBe(true)
    const half = placeFixes(text, [{ find: words.slice(0, 200).join(' '), replace: words.slice(0, 200).join('-') + ' et la suite' }], 'fr').fixes
    expect(fixGuard(text, half).ok).toBe(false)
    const grown = placeFixes(text, [{ find: 'mot5', replace: Array(100).fill('ajout').join(' ') }], 'fr').fixes
    expect(fixGuard(text, grown).ok).toBe(false)
    const short = 'Une scène de quelques mots seulement.'
    expect(fixGuard(short, placeFixes(short, [{ find: short, replace: 'Tout est changé ici.' }], 'fr').fixes).ok).toBe(true)
  })
  it('asks for replacements only, with what failed', () => {
    const msg = fixRequest('Il sortit.', [{ id: 'x', label: 'X', ok: false, detail: '1', fix: 'Corrige ceci' }], 'fr')
    expect(msg).toContain('Corrige ceci')
    expect(msg).toContain('"find"')
    expect(msg).toContain('<scene>\nIl sortit.\n</scene>')
  })
})

describe('outline', () => {
  const alice = entry({ slug: 'alice', type: 'character', name: 'Alice Cullen', aliases: ['Alice'] })
  const forks = entry({ slug: 'forks', type: 'place', name: 'Forks' })
  it('keeps the outline fields in the scene file', () => {
    const s = { ...scene('a', 'Text.'), beats: ['He waits.', 'She comes, late, tired.'], cast: ['Alice'], reveals: 'The letter.', arc: 'calm → afraid', pace: 'slow', locked: true }
    const back = parseScene(s.path, serializeScene(s))
    expect(back.beats).toEqual(['He waits.', 'She comes, late, tired.'])
    expect(back.cast).toEqual(['Alice'])
    expect(back.locked).toBe(true)
    expect(back.extra).toEqual({})
  })
  it('reads Claude’s chapter as a proposal: real ids only, never a locked card, no id twice', () => {
    const book = bookOf([scene('a', ''), { ...scene('b', ''), locked: true }], [alice, forks])
    const c = book.chapters[0]
    const p = readChapterProposal(book, c, { goal: 'Get in.', scenes: [
      { id: 'a', title: 'One', summary: 'S', pov: 'Alice', place: 'forks', beats: '1. Go\n2. Stop' },
      { id: 'a', title: 'Two' }, { id: 'b', title: 'Three' }, { id: 'zz', title: 'Four' },
    ] }, 'regenerate')!
    expect(p.goal).toBe('Get in.')
    expect(p.scenes.map(s => s.id)).toEqual(['a', null, null, null])
    expect(p.scenes[0]).toMatchObject({ pov: 'alice', place: 'forks', beats: ['Go', 'Stop'], note: 'S' })
  })
  it('merges two cards and keeps what a draft leaves empty', () => {
    const a = { ...scene('a', 'First.'), beats: ['x'], arc: 'calm → tense', cast: ['A'] }
    const b = { ...scene('b', 'Second.'), beats: ['y'], arc: 'tense → afraid', cast: ['A', 'B'] }
    expect(mergeCards(a, b)).toMatchObject({ beats: ['x', 'y'], arc: 'calm → afraid', cast: ['A', 'B'], text: 'First.\n\nSecond.' })
    const d = { id: 'a', title: 'T', note: '', pov: null, place: null, beats: [], cast: [], reveals: 'R', arc: '', pace: '' }
    expect(cardPatch(d, a)).toMatchObject({ title: 'T', beats: ['x'], reveals: 'R', arc: 'calm → tense' })
  })
  it('says one scene is the norm by default, and sends the detailed card when writing', () => {
    expect(outlineRules('en', { kind: 'one' })).toContain('Most chapters are a single scene')
    expect(outlineRules('en', { kind: 'one' })).toContain('A change of place is not enough')
    expect(outlineRules('en', { kind: 'one' })).not.toContain('one place,')
    const s = { ...scene('a', '', { note: 'N' }), beats: ['He waits.'], reveals: 'The letter.' }
    const book = bookOf([s], [])
    book.chapters[0] = { ...book.chapters[0], goal: 'Get in.', ending: 'The door was open all along.' }
    const lines = outlineLines(book, book.chapters[0].scenes[0], 'en').join('\n')
    expect(lines).toContain('Chapter goal : Get in.')
    expect(lines).toContain('1. He waits.')
    expect(lines).toContain('Chapter ending : The door was open all along.')
  })
  const ch = (id: string, scenes: Scene[], over: Partial<Chapter> = {}): Chapter => ({ id, folder: id, kind: 'chapter', title: id.toUpperCase(), notes: '', scenes, ...over })
  it('reads a revision of the whole outline: new chapters, changes, moves, and what it may not touch', () => {
    const book = { ...bookOf([]), chapters: [ch('c1', [scene('a', 'Written text.')]), ch('c2', [scene('b', ''), scene('x', '')]), ch('c3', [{ ...scene('d', ''), locked: true }, scene('e', '')])] }
    const rev = readRevision(book, {
      note: 'A chapter at court first.',
      chapters: [
        { id: null, title: 'Before', goal: 'Set the stage.', scenes: [{ id: null, title: 'Court', summary: 'At court.' }, { id: 'e', title: 'E moved' }] },
        { id: 'c1' },
        { id: 'c2', goal: 'New goal.', scenes: [{ id: 'b', title: 'b' }, { id: 'd', title: 'Locked' }] },
        { id: 'zz', title: '' },
      ],
      remove: ['a', 'x', 'c3', 'e'],
    })!
    expect(rev.note).toBe('A chapter at court first.')
    expect(rev.chapters.map(c => c.key)).toEqual(['new:1', 'c1', 'c2', 'c3'])
    expect(rev.chapters[0].scenes!.map(s => s.id)).toEqual([null, 'e'])
    expect(revisionChanges(rev.chapters[1])).toBe(false)
    expect(rev.chapters[2]).toMatchObject({ goal: 'New goal.' })
    expect(rev.chapters[2].scenes!.map(s => s.id)).toEqual(['b'])
    expect(rev.remove).toEqual(['x'])
    expect(rev.refused).toEqual(['a', 'C3'])
    expect(rev.reordered).toBe(false)
    expect(revisionOrder(book, rev, () => true)).toEqual(['new:1', 'c1', 'c2', 'c3'])
    expect(revisionOrder(book, rev, k => k !== 'new:1' && k !== 'rm:x')).toEqual(['c1', 'c2', 'c3'])
    expect(readRevision(book, { note: 'x' })).toBeNull()
  })
  it('keeps published chapters first and as they are when the outline is revised', () => {
    const book = { ...bookOf([]), chapters: [ch('c1', [scene('a', 'Out.')], { published: '2026-10-01' }), ch('c2', [scene('b', '')]), ch('c3', [scene('c', '')])] }
    const rev = readRevision(book, { chapters: [{ id: 'c3' }, { id: 'c1', title: 'Renamed' }, { id: null, title: 'New' }, { id: 'c2' }] })!
    expect(rev.reordered).toBe(true)
    expect(rev.refused).toEqual(['C1'])
    expect(revisionChanges(rev.chapters.find(c => c.id === 'c1')!)).toBe(false)
    expect(revisionOrder(book, rev, () => true)).toEqual(['c1', 'c3', 'new:1', 'c2'])
    expect(revisionOrder(book, rev, k => k !== 'order')).toEqual(['c1', 'new:1', 'c2', 'c3'])
    const text = revisionText({ ...book, chapters: [book.chapters[0], ch('c2', [{ ...scene('b', ''), locked: true }])] })
    expect(text).toContain('## 1. [c1] [published] C1')
    expect(text).toContain('- [a] [written, 1 words] a')
    expect(text).toContain('- [b] [locked] b')
  })
})

describe('edit this chapter', () => {
  it('places a fix on its words, never on top of another fix', () => {
    const text = 'She ran. She ran again.'
    expect(locate(text, 'She ran', [])).toBe(0)
    expect(locate(text, 'She ran', [{ from: 0, to: 7 }])).toBe(9)
    expect(locate(text, 'flew', [])).toBe(-1)
  })
})

describe('story foundation, turning points and outline versions', () => {
  it('sends the premise, the foundation and where each turning point falls', () => {
    const book = bookOf([scene('a', '')], [])
    book.meta.summary = 'A seer hunts her own future.'
    book.meta.foundation = { logline: 'Alice must stop a vision.', stakes: 'Her family.' }
    book.chapters[0].title = 'The diner'
    book.meta.structure = { template: 'three-acts', beats: [{ name: 'Midpoint', at: 50, note: 'She sees her death.', sceneId: 'a' }] }
    const f = foundationText(book)
    expect(f).toContain('<premise>\nA seer hunts her own future.')
    expect(f).toContain('Logline : Alice must stop a vision.')
    expect(f).not.toContain('Theme')
    book.meta.foundation.tone = 'Grim, morally gray.'
    book.meta.foundation.comps = 'Abercrombie.'
    const sys = systemPrompt(book, 'continue', 0)
    expect(sys).toContain('<tone>\nGrim, morally gray.\n</tone>')
    expect(sys).not.toContain('Abercrombie')
    expect(turningPointsText(book)).toContain('- Midpoint (50 %): She sees her death. → The diner')
  })
  it('tells a series book to plant later books and never play them out, and sends seeds as passing details', () => {
    const book = bookOf([{ ...scene('a', ''), seeds: 'A crown-shaped scar.' }], [])
    expect(seriesText(book)).toBe('')
    book.meta.series = { path: '../S', index: 2 }
    book.seriesPlan = { books: 'Book 2: the siege.\nBook 3: the queen.' }
    const s = seriesText(book)
    expect(s).toContain('This book is book 2 of a series.')
    expect(s).toContain('Book 3: the queen.')
    expect(s).toContain('never resolve, reveal or start the events of later books')
    expect(outlineLines(book, book.chapters[0].scenes[0], 'en').join('\n')).toContain('Seeds for later books (a passing detail; never name, explain or resolve them) : A crown-shaped scar.')
    expect(cardSpec('en', true)).toContain('"seeds"')
    expect(cardSpec('en')).not.toContain('"seeds"')
  })
  it('keeps earlier versions (never empty ones) and brings one back as a proposal', () => {
    const c = { ...bookOf([{ ...scene('a', ''), note: 'Old summary.', beats: ['x'] }], []).chapters[0], goal: 'Old goal.' }
    let all = addVersion({}, c.id, versionOf(c, 'Before Detail'))
    expect(all[c.id]).toHaveLength(1)
    const empty = { ...c, goal: undefined, scenes: [scene('b', '')] }
    all = addVersion(all, c.id, versionOf(empty, 'Empty'))
    expect(all[c.id]).toHaveLength(1)
    const p = versionProposal(c, all[c.id][0])
    expect(p.goal).toBe('Old goal.')
    expect(p.scenes[0]).toMatchObject({ id: 'a', note: 'Old summary.', beats: ['x'] })
  })
})

describe('web novels', () => {
  const ch = (id: string, text: string, over: Partial<Chapter> = {}): Chapter => ({ id, folder: id, kind: 'chapter', title: id.toUpperCase(), notes: '', scenes: [scene(`s-${id}`, text)], ...over })
  const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
  const serialBook = (chapters: Chapter[], entries: Entry[] = []): Book => {
    const b = bookOf([], entries)
    return { ...b, chapters, meta: { ...b.meta, kind: 'serial', serial: { ...DEFAULT_SERIAL, days: [1, 3, 5] }, ai: { ...b.meta.ai, chapterWords: [2000, 3500] } } }
  }
  const wed = new Date(2026, 9, 21)

  it('counts the buffer after the last published chapter, and until when it lasts', () => {
    const book = serialBook([ch('a', words(2500), { published: '2026-10-19' }), ch('b', words(2500)), ch('c', words(1700)), ch('d', words(100)), ch('e', words(2500))])
    const buf = bufferOf(book, wed)
    expect(buf.ready.map(c => c.id)).toEqual(['b', 'c'])
    expect(buf.next).toEqual(wed)
    expect(buf.until).toEqual(new Date(2026, 9, 23))
  })
  it('starts the schedule tomorrow when a chapter went out today', () => {
    const book = serialBook([ch('a', words(2500), { published: '2026-10-21' }), ch('b', words(2500))])
    expect(bufferOf(book, wed).next).toEqual(new Date(2026, 9, 23))
  })
  it('lists release days and counts the weeks on schedule', () => {
    expect(releaseDates(wed, [1, 5], 3)).toEqual([new Date(2026, 9, 23), new Date(2026, 9, 26), new Date(2026, 9, 30)])
    const pub = (id: string, day: string) => ch(id, words(10), { published: day })
    const book = serialBook([pub('a', '2026-10-05'), pub('b', '2026-10-07'), pub('c', '2026-10-09'), pub('d', '2026-10-12'), pub('e', '2026-10-14'), pub('f', '2026-10-16'), pub('g', '2026-10-19')])
    expect(weekReleases(book, wed)).toBe(1)
    expect(releaseStreak(book, wed)).toBe(2)
  })
  it('reads arcs and volumes from the chapters that start them', () => {
    const book = serialBook([ch('a', '', { part: 'Book One', arc: 'The Trial' }), ch('b', ''), ch('c', '', { arc: 'The Tower' }), ch('d', '', { part: 'Book Two' })])
    expect(arcsOf(book).map(a => [a.title, a.start, a.end])).toEqual([['The Trial', 0, 2], ['The Tower', 2, 4]])
    expect(volumesOf(book).map(v => [v.title, v.start, v.end])).toEqual([['Book One', 0, 3], ['Book Two', 3, 4]])
    expect([beatChapter(30, 0), beatChapter(30, 50), beatChapter(30, 100)]).toEqual([1, 16, 30])
  })
  it('flags a missing hook and a flat ending, never on a published chapter', () => {
    const c = ch('a', words(2500))
    const book = serialBook([c])
    expect(hookFlags(book, c)).toEqual(['no-hook', 'no-ending'])
    const read = { ...c, hook: 'x', ending: 'y', hookCheck: { of: textKey(c.scenes[0].text), hook: 4, end: 2, note: '' } }
    expect(hookFlags(book, read)).toEqual(['weak-end'])
    // Claude read an older text: its rating no longer counts.
    expect(hookFlags(book, { ...read, scenes: [scene('s', words(2600))] })).toEqual([])
    expect(hookFlags(book, { ...c, published: '2026-10-01' })).toEqual([])
  })
  it('flags a thread left untouched for too long', () => {
    const book = serialBook(Array.from({ length: 14 }, (_, i) => ch(`c${i}`, 'text')))
    book.meta.threads = [
      { id: 't1', text: 'Who sent the letter?', kind: 'mystery', planted: 'c1', touched: ['c2'], resolved: null },
      { id: 't2', text: 'The tournament', kind: 'promise', planted: 'c1', touched: ['c9'], resolved: null },
      { id: 't3', text: 'The sword', kind: 'setup', planted: 'c0', touched: [], resolved: 'c5' },
    ]
    expect(threadStates(book).map(x => [x.thread.id, x.gap, x.flagged])).toEqual([['t1', 11, true], ['t2', 4, false], ['t3', 13, false]])
  })
  it('finds system boxes and reads their stats', () => {
    const text = 'Kael looked.\n| Status\n| Name: Kael\n| Level: 12\n| Strength: 30\nHe grinned.'
    const boxes = systemBoxes(text)
    expect(boxes).toHaveLength(1)
    expect(text.slice(boxes[0].from, boxes[0].to)).toBe('| Status\n| Name: Kael\n| Level: 12\n| Strength: 30')
    expect(readBox(boxes[0].lines)).toEqual({ name: 'Kael', stats: [{ name: 'Level', value: '12' }, { name: 'Strength', value: '30' }] })
    expect(maskSystem(text)).toHaveLength(text.length)
    expect(maskSystem(text)).not.toContain('Level')
  })
  it('keeps stats by chapter and flags a box that disagrees', () => {
    let stats = mergeStats([], [{ name: 'Level', value: '5' }], 1)
    stats = mergeStats(stats, [{ name: 'level', value: '12' }, { name: 'Strength', value: '30' }], 80)
    expect(statsAt(stats, 40)).toEqual([{ name: 'Level', value: '5', from: 1 }])
    expect(statsAt(stats, 80).map(s => `${s.name} ${s.value}`)).toEqual(['Level 12', 'Strength 30'])
    expect(mergeStats(stats, [{ name: 'Level', value: '12' }], 81)).toEqual(stats)
    const kael = entry({ slug: 'kael', name: 'Kael', stats })
    const chapters = Array.from({ length: 80 }, (_, i) => ch(`c${i}`, i === 79 ? '| Name: Kael\n| Level: 11' : ''))
    expect(statConflicts(serialBook(chapters, [kael]))).toEqual([{ sceneId: 's-c79', chapter: 80, who: 'Kael', stat: 'Level', inText: '11', known: '12' }])
    // The AI gets the values as they stand at the chapter.
    const ctx = buildContext({ book: serialBook(chapters, [kael]), chapter: 80, pov: 'kael', action: 'continue', instruction: '', before: 'Kael ran.', selection: '', after: '', overrides: {} })
    expect(ctx.message).toContain('Stats at this point : Level 12, Strength 30')
  })
  it('copies a chapter for Royal Road and gives its title', () => {
    const c = { ...ch('a', ''), title: 'The Gate', scenes: [scene('s1', 'She *ran*.\n| Level up!\n| Level: 2'), scene('s2', 'Night fell.')] }
    const book = serialBook([c])
    const html = royalRoadHtml(book, c)
    expect(html).toContain('<p>She <em>ran</em>.</p>')
    expect(html).toContain('<table><tbody><tr><td>Level up!<br>Level: 2</td></tr></tbody></table>')
    expect(html).toContain('\n<hr>\n<p>Night fell.</p>')
    expect(chapterTitleFor(book, 0)).toBe('Chapter 1: The Gate')
  })
  it('makes a volume a book of its own, numbered from 1, without recaps', () => {
    const book = serialBook([ch('a', 'One.', { part: 'Book One' }), ch('b', 'Previously, she fell.\nShe woke.', { part: 'Book Two', published: '2026-10-01' }), ch('c', 'Three.')])
    const v = volumeBook(book, 1, 3, 'Book Two')
    expect(v.meta.title).toBe('T: Book Two')
    expect(v.chapters.map(c => c.id)).toEqual(['b', 'c'])
    expect(v.chapters[0]).toMatchObject({ part: undefined, published: undefined })
    expect(v.chapters[0].scenes[0].text).toBe('She woke.')
    const o = { format: 'md' as const, layout: 'book' as const, titlePage: true, sceneBreak: '* * *' }
    expect(toMarkdown(v, o)).toContain('## Chapter 1 : B')
    const range = toMarkdown(book, { ...o, range: [1, 2] })
    expect(range).toContain('## Chapter 2 : B')
    expect(range).not.toContain('Three.')
  })
  it('remembers a long serial by arcs, published chapters marked as canon', () => {
    const book = serialBook([ch('a', 'x', { arc: 'One', summary: 'A1.' }), ch('b', 'x', { summary: 'B1.', published: '2026-10-01' }), ch('c', 'x', { arc: 'Two', summary: 'C1.', published: '2026-10-03' }), ch('d', 'x')])
    book.meta.arcs = { a: { template: '', beats: [], planned: 2, summary: 'Arc one sum.' } }
    const s = serialStorySoFar(book, 's-d')
    expect(s).toContain('Arc « One » : Arc one sum.')
    expect(s).not.toContain('A1.')
    expect(s).toContain('C (published) : C1.')
    book.meta.summary = 'Everything so far.'
    expect(serialStorySoFar(book, 's-d', 10)).toContain('Earlier : Everything so far.')
    expect(systemPrompt(book, 'continue', 4)).toContain('Chapters marked (published) have been read')
  })
  it('flags walls of text, in a web novel only', () => {
    const wall = words(100) + '.'
    const ids = (b: Book) => review(wall, b).results.map(r => r.def.id)
    expect(ids(bookOf([]))).not.toContain('walls')
    expect(ids(serialBook([]))).toContain('walls')
  })
})

describe('detection switch', () => {
  const flower = entry({ slug: 'rose-flower', type: 'lore', name: 'rose', detect: false, short: 'A motif.' })
  it('stops looking for the name in the text, but @-mentions still work', () => {
    expect(findMentions('une rose rouge', buildMatcher([flower]))).toEqual([])
    expect(findMentions('une rose rouge', buildMatcher([flower], true)).length).toBe(1)
    const base = { book: bookOf([], [flower]), chapter: 1, pov: null, action: 'continue' as const, instruction: '', before: 'une rose rouge', selection: '', after: '', overrides: {} }
    expect(buildContext(base).picked.map(p => p.slug)).not.toContain('rose-flower')
    expect(buildContext({ ...base, instruction: 'Use @rose here' }).picked.find(p => p.slug === 'rose-flower')?.mode).toBe('full')
  })
  it('is kept in the file only when off', () => {
    const path = 'bible/lore/rose-flower.md'
    expect(parseEntry(path, serializeEntry({ ...flower, path })).detect).toBe(false)
    expect(serializeEntry({ ...flower, path, detect: undefined })).not.toContain('detect')
  })
  it('is not reported as an unused entry', () => {
    const issues = checkBible(bookOf([scene('a', 'Une rose rouge.')], [flower])).issues
    expect(issues.some(i => i.kind === 'unused')).toBe(false)
  })
})

describe('[[ links in entries', () => {
  const list = [entry({ slug: 'elise', name: 'Élise', aliases: ['Lise'] }), entry({ slug: 'aube', type: 'object', name: 'Aube' }), entry({ slug: 'guide', type: 'style', name: 'Style guide' })]
  it('sees the [[ being typed, not one already closed or on another line', () => {
    expect(linkQuery('Ami de [[Eli', 12)).toEqual({ from: 7, query: 'Eli' })
    expect(linkQuery('Ami de [[Eli]] et', 17)).toBeNull()
    expect(linkQuery('[[Eli\nsuite', 11)).toBeNull()
    expect(linkQuery('pas de lien', 5)).toBeNull()
  })
  it('finds entries by name and alias, without accents, never itself or the voice materials', () => {
    expect(linkMatches(list, 'eli', 'aube').map(e => e.slug)).toEqual(['elise'])
    expect(linkMatches(list, 'lise', 'aube').map(e => e.slug)).toEqual(['elise'])
    expect(linkMatches(list, '', 'aube').map(e => e.slug)).toEqual(['elise'])
    expect(linkMatches(list, 'style', 'aube')).toEqual([])
  })
  it('leaves the plain name in the text', () => {
    expect(applyLink('Ami de [[Eli et', 7, 12, 'Élise')).toEqual({ text: 'Ami de Élise et', caret: 12 })
    expect(applyLink('Ami de [[Eli]] et', 7, 12, 'Élise').text).toBe('Ami de Élise et')
    expect(isKnownName(list, 'lise')).toBe(true)
    expect(isKnownName(list, 'Marc')).toBe(false)
  })
})

describe('your own shortcuts', () => {
  const key = (k: string, m: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({ key: k, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...m })
  it('reads a key press as text', () => {
    expect(keysOf(key('e', { ctrlKey: true }))).toBe('Ctrl+E')
    expect(keysOf(key('E', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+E')
    expect(keysOf(key('ArrowUp', { altKey: true }))).toBe('Alt+Up')
    expect(keysOf(key('Control', { ctrlKey: true }))).toBe('')
  })
  it('refuses keys that type or that Plume already uses', () => {
    expect(keysProblem('E')).toBe('types')
    expect(keysProblem('Shift+E')).toBe('types')
    expect(keysProblem('Ctrl+Alt+E')).toBe('altgr')
    expect(keysProblem('Ctrl+K')).toBe('fixed')
    expect(keysProblem('Ctrl+E')).toBeNull()
    expect(keysProblem('Alt+E')).toBeNull()
    expect(keysProblem('F7')).toBeNull()
    expect(keysOwner('Ctrl+E', { export: 'Ctrl+E' }, 'zen')).toBe('export')
    expect(keysOwner('Ctrl+E', { export: 'Ctrl+E' }, 'export')).toBeNull()
  })
  it('ranks your short name first, and what belongs where you are', () => {
    const items = actionItems([{ id: 'export', label: 'Export…' }, { id: 'expand', label: 'Expand the text', where: ['manuscript'] }, { id: 'zen', label: 'Distraction-free', where: ['manuscript'] }], { zen: 'ex' })
    expect(rankJump(items, 'ex')[0].id).toBe('zen')
    expect(rankJump(items, 'exp')[0].id).toBe('export')
    expect(rankJump(items, 'exp', 30, 'manuscript')[0].id).toBe('expand')
    expect(rankJump(items, '', 30, 'manuscript').map(i => i.id)).toEqual(['expand', 'zen'])
    expect(rankJump(items, '')).toEqual([])
  })
})

describe('capture lines', () => {
  it('reads the four words, in English and in French', () => {
    expect(parseCapture('::idea un duel au matin')).toEqual({ kind: 'idea', text: 'un duel au matin' })
    expect(parseCapture('::Idée un duel')).toEqual({ kind: 'idea', text: 'un duel' })
    expect(parseCapture('::todo vérifier la date')?.kind).toBe('todo')
    expect(parseCapture('::tâche vérifier la date')?.kind).toBe('todo')
    expect(parseCapture('::comment trop long')?.kind).toBe('comment')
    expect(parseCapture('  ::commentaire : trop long')).toEqual({ kind: 'comment', text: 'trop long' })
  })
  it('splits ::bible at the first colon', () => {
    expect(parseCapture('::bible Élise : a peur du feu')).toEqual({ kind: 'bible', name: 'Élise', text: 'a peur du feu' })
    expect(parseCapture('::fiche Marc: né à Valombre: 1802')).toEqual({ kind: 'bible', name: 'Marc', text: 'né à Valombre: 1802' })
    expect(parseCapture('::bible Marc')).toEqual({ kind: 'bible', name: 'Marc', text: '' })
  })
  it('accepts the no-break spaces French typography adds', () => {
    expect(parseCapture('\u00a0:\u202f:idea un duel')?.kind).toBe('idea')
  })
  it('leaves everything else in the text', () => {
    expect(parseCapture('Il dit : idea')).toBeNull()
    expect(parseCapture('::idea')).toBeNull()
    expect(parseCapture('::constructor un duel')).toBeNull()
    expect(parseCapture('::recette un duel')).toBeNull()
    expect(captureKind('::idea')).toBe('idea')
    expect(captureKind('::constructor')).toBeNull()
  })
  it('pins a comment to the last sentence above, and finds it again', () => {
    const text = 'Le premier paragraphe.\n\nElle entra. Il pleuvait sur Valombre.\n::comment trop vague'
    const c = captureQuote(text, text.indexOf('::comment'))!
    expect(c.quote).toBe('Il pleuvait sur Valombre.')
    expect(text.slice(c.at, c.at + c.quote.length)).toBe(c.quote)
    expect(captureQuote('« Non ! » dit-il.\n::comment x', 18)?.quote).toBe('« Non ! » dit-il.')
    expect(captureQuote('::comment x', 0)).toBeNull()
  })
})

describe('undo for the Plan and the Bible', () => {
  it('undoes and redoes, newest first', () => {
    const s = undoStack()
    let v = 0
    s.push('', 'a', () => { v = 0 }, () => { v = 1 })
    v = 1
    s.push('', 'b', () => { v = 1 }, () => { v = 2 })
    v = 2
    expect(s.undo()?.name).toBe('b')
    expect(v).toBe(1)
    expect(s.undo()?.name).toBe('a')
    expect(v).toBe(0)
    expect(s.undo()).toBeNull()
    expect(s.redo()?.name).toBe('a')
    expect(v).toBe(1)
  })
  it('counts a burst on the same thing as one step, and only a burst', () => {
    const s = undoStack(60, 1000)
    const seen: string[] = []
    s.push('name', 'x', () => seen.push('first'), () => seen.push('redo1'), 0)
    s.push('name', 'x', () => seen.push('second'), () => seen.push('redo2'), 500)
    s.undo()
    expect(seen).toEqual(['first'])
    s.redo()
    expect(seen).toEqual(['first', 'redo2'])
    s.push('name', 'x', () => seen.push('late'), () => {}, 900)
    s.undo()
    expect(seen).toEqual(['first', 'redo2', 'late'])
  })
  it('forgets what could be redone once you change something else', () => {
    const s = undoStack()
    s.push('', 'a', () => {}, () => {})
    s.undo()
    s.push('', 'b', () => {}, () => {})
    expect(s.redo()).toBeNull()
  })
  it('does not record what undo itself changes, and keeps a limit', () => {
    const s = undoStack(2)
    s.push('', 'a', () => { s.push('', 'inner', () => {}, () => {}) }, () => {})
    expect(s.undo()?.name).toBe('a')
    expect(s.undo()).toBeNull()
    s.push('', '1', () => {}, () => {})
    s.push('', '2', () => {}, () => {})
    s.push('', '3', () => {}, () => {})
    expect([s.undo()?.name, s.undo()?.name, s.undo()]).toEqual(['3', '2', null])
  })
  it('a toast takes back its own step, even under another', () => {
    const s = undoStack()
    let back = false
    const step = s.push('', 'a', () => { back = true }, () => {})
    s.push('', 'b', () => {}, () => {})
    s.takeBack(step)
    expect(back).toBe(true)
    expect(s.undo()?.name).toBe('b')
    expect(s.undo()).toBeNull()
  })
  it('sees which keys change', () => {
    const o = { a: 1, b: 2, c: 3 }
    expect(changedKeys(o, { a: 1, b: 5 })).toEqual(['b'])
    expect(changedKeys(o, { b: 5, c: 6 }, ['c'])).toEqual(['c'])
  })
})

describe('snapshots of the bible and the plan', () => {
  const elise = entry({ slug: 'elise', name: 'Élise', short: 'Une duchesse.' })
  const book = bookOf([scene('a', 'Texte.', { note: 'Elle arrive.', beats: ['entrer'] })], [elise])
  const snap = makeSnap(book, 'avant')
  it('sees nothing when nothing changed', () => {
    expect(compareEntries(book, snap)).toEqual([])
    expect(comparePlan(book, snap)).toEqual([])
  })
  it('finds changed, new and removed entries', () => {
    const marc = entry({ slug: 'marc', name: 'Marc' })
    const later = { ...book, entries: [{ ...elise, short: 'Une reine.' }, marc] }
    expect(compareEntries(later, snap).map(c => [c.slug, c.kind])).toEqual([['elise', 'changed'], ['marc', 'new']])
    const gone = compareEntries({ ...book, entries: [] }, snap)
    expect(gone.map(c => [c.slug, c.kind])).toEqual([['elise', 'removed']])
    expect(parseEntry(gone[0].path, gone[0].before).short).toBe('Une duchesse.')
  })
  it('finds a card that changed, not one that only went from nothing to empty', () => {
    const edit = (patch: object) => ({ ...book, chapters: book.chapters.map(c => ({ ...c, scenes: c.scenes.map(s => ({ ...s, ...patch })) })) })
    const changes = comparePlan(edit({ note: 'Elle fuit.' }), snap)
    expect(changes.map(c => [c.id, c.level])).toEqual([['a', 'scene']])
    expect(planText(changes[0].before, k => k.toUpperCase())).toContain('NOTE: Elle arrive.')
    expect(planText(changes[0].before, k => k)).toContain('beats: entrer')
    const empty = makeSnap(edit({ reveals: undefined }), 'x')
    expect(comparePlan(edit({ reveals: '' }), empty)).toEqual([])
  })
  it('still opens a snapshot from before 0.39', () => {
    const old = { ...snap, entries: undefined, plan: undefined }
    expect(compareEntries(book, old)).toEqual([])
    expect(comparePlan(book, old)).toEqual([])
    expect(compareSnap(book, old)).toEqual([])
  })
})

describe('fields per type of entry', () => {
  it('sets a field up once per type, whatever its capitals', () => {
    const one = addField(undefined, 'character', 'Âge')
    expect(hasField(one, 'character', 'age')).toBe(true)
    expect(hasField(one, 'place', 'âge')).toBe(false)
    expect(addField(one, 'character', 'AGE').character).toEqual([{ name: 'Âge' }])
    expect(addField(one, 'character', ' Rôle ').character?.map(d => d.name)).toEqual(['Âge', 'Rôle'])
    expect(removeField(one, 'character', 'Âge').character).toEqual([])
    expect(setFieldSend(one, 'character', 'Âge', 'never').character).toEqual([{ name: 'Âge', send: 'never' }])
    expect(setFieldSend(setFieldSend(one, 'character', 'Âge', 'never'), 'character', 'Âge', undefined).character).toEqual([{ name: 'Âge' }])
  })
  it('keeps the values when a field is renamed', () => {
    const list = [entry({ slug: 'a', fields: { Age: '30', Role: 'x' } }), entry({ slug: 'b' }), entry({ slug: 'c', type: 'place', fields: { Age: 'vieux' } })]
    expect(renameField(addField(undefined, 'character', 'Age'), 'character', 'Age', 'Âge').character).toEqual([{ name: 'Âge' }])
    expect(renamedValues(list, 'character', 'Age', 'Âge')).toEqual([{ slug: 'a', fields: { Role: 'x', Âge: '30' } }])
  })
  it('lives in the entry file, empty values left out', () => {
    const path = 'bible/characters/a.md'
    const e = entry({ slug: 'a', path, fields: { Âge: '32', Rôle: '' } })
    expect(parseEntry(path, serializeEntry(e)).fields).toEqual({ Âge: '32' })
    expect(serializeEntry({ ...e, fields: { Rôle: ' ' } })).not.toContain('fields')
    expect(parseEntry(path, serializeEntry({ ...e, fields: undefined })).extra).toEqual({})
  })
  it('reaches Claude with the full version unless the field says otherwise', () => {
    const e = entry({ short: 'Courte.', fields: { Age: '30', Role: 'duc', Secret: 'traître', Vide: ' ' } })
    const defs = [{ name: 'Age' }, { name: 'Role', send: 'always' as const }, { name: 'Secret', send: 'never' as const }, { name: 'Vide' }, { name: 'Absent' }]
    expect(fieldLines(e, defs, 'full')).toEqual(['Age : 30', 'Role : duc'])
    expect(fieldLines(e, defs, 'short')).toEqual(['Role : duc'])
    expect(renderEntry(e, 'full', 1, 'fr', 1, false, defs)).toContain('Age : 30')
    expect(renderEntry(e, 'short', 1, 'fr', 1, false, defs)).not.toContain('Age : 30')
    expect(renderEntry(e, 'full', 1, 'fr')).toBe(renderEntry({ ...e, fields: undefined }, 'full', 1, 'fr'))
  })
  it('finds the entry a value names, never itself', () => {
    const list = [entry({ slug: 'v', type: 'place', name: 'Valombre', aliases: ['La Vallée'] }), entry({ slug: 'm', name: 'Marc' })]
    expect(entryNamed(list, 'valombre')?.slug).toBe('v')
    expect(entryNamed(list, 'la vallee')?.slug).toBe('v')
    expect(entryNamed(list, 'Marc', 'm')).toBeUndefined()
    expect(entryNamed(list, '')).toBeUndefined()
  })
  it('sorts a column, numbers as numbers and empty cells last', () => {
    const list = [entry({ slug: 'a', name: 'B', fields: { Age: '9' } }), entry({ slug: 'b', name: 'A', fields: { Age: '30' } }), entry({ slug: 'c', name: 'C' })]
    expect(sortEntries(list, 'name').map(e => e.slug)).toEqual(['b', 'a', 'c'])
    expect(sortEntries(list, 'Age').map(e => e.slug)).toEqual(['a', 'b', 'c'])
    expect(sortEntries(list, 'Age', true).map(e => e.slug)).toEqual(['b', 'a', 'c'])
  })
})

describe('grouped undo', () => {
  it('counts a group as one step, undone in reverse', async () => {
    const s = undoStack()
    const seen: string[] = []
    await s.group('rename', () => {
      s.push('k', '1', () => seen.push('undo1'), () => seen.push('redo1'))
      s.push('k', '2', () => seen.push('undo2'), () => seen.push('redo2'))
    })
    expect(s.undo()?.name).toBe('rename')
    expect(seen).toEqual(['undo2', 'undo1'])
    expect(s.undo()).toBeNull()
    s.redo()
    expect(seen).toEqual(['undo2', 'undo1', 'redo1', 'redo2'])
  })
})

describe('the outline as a list', () => {
  const chapter = (id: string, scenes: Scene[], over: Partial<Chapter> = {}): Chapter => ({ id, folder: `ch-${id}`, kind: 'chapter', title: id, notes: '', scenes, ...over })
  const withChapters = (...chapters: Chapter[]) => ({ ...bookOf([]), chapters })

  it('lists chapters, scenes and beats in order', () => {
    const book = withChapters(chapter('c1', [scene('s1', '', { beats: ['un', 'deux'] }), scene('s2', '')]), chapter('c2', []))
    expect(outlineRows(book).map(r => [r.level, r.text])).toEqual([[0, 'c1'], [1, 's1'], [2, 'un'], [2, 'deux'], [1, 's2'], [0, 'c2']])
    expect(outlineRows(book)[3]).toMatchObject({ scene: 's1', beat: 1, chapter: 'c1' })
  })
  it('only lets a scene turn into a beat when nothing would be lost', () => {
    expect(plainScene(scene('a', ''))).toBe(true)
    expect(plainScene(scene('a', '', { beats: ['x'], comments: [] }))).toBe(true)
    expect(plainScene(scene('a', 'Du texte.'))).toBe(false)
    expect(plainScene(scene('a', '', { note: 'Elle arrive.' }))).toBe(false)
    expect(plainScene(scene('a', '', { locked: true }))).toBe(false)
    expect(plainScene(scene('a', '', { extra: { mine: 1 } }))).toBe(false)
    // Its POV is no loss if the scene it joins has the same.
    expect(plainScene(scene('a', '', { pov: 'elise' }))).toBe(false)
    expect(plainScene(scene('a', '', { pov: 'elise', cast: ['Marc'] }), scene('b', '', { pov: 'elise', cast: ['Marc'] }))).toBe(true)
    expect(plainScene(scene('a', '', { pov: 'elise' }), scene('b', '', { pov: 'marc' }))).toBe(false)
  })
  it('only lets a chapter turn into a scene when nothing would be lost', () => {
    expect(plainChapter(chapter('c', []))).toBe(true)
    expect(plainChapter(chapter('c', [], { goal: 'Fuir.' }))).toBe(false)
    expect(plainChapter(chapter('c', [], { notes: 'Note' }))).toBe(false)
    expect(chapterAsBeats(chapter('c', [scene('Scène 1', ''), scene('La fuite', '', { beats: ['Elle court'] }), scene('', '', { beats: ['Elle tombe'] })]))).toEqual(['La fuite', 'Elle court', 'Elle tombe'])
    expect(stockSceneTitle('Scene 12')).toBe(true)
    expect(stockSceneTitle('Scène 2 bis')).toBe(false)
  })
  it('moves a beat within its scene, then into the next one', () => {
    const book = withChapters(chapter('c1', [scene('s1', '', { beats: ['a', 'b'] })]), chapter('c2', [scene('s2', '', { beats: ['c'] }), scene('s3', '')]))
    expect(beatMove(book, 's1', 0, 1)).toMatchObject({ scene: { id: 's1' }, at: 1 })
    expect(beatMove(book, 's1', 1, 1)).toMatchObject({ scene: { id: 's2' }, at: 0 })
    expect(beatMove(book, 's2', 0, -1)).toMatchObject({ scene: { id: 's1' }, at: 2 })
    expect(beatMove(book, 's1', 0, -1)).toBeNull()
    expect(beatMove(book, 's3', 0, 1)).toBeNull()
  })
  it('makes rows of pasted lines', () => {
    expect(pastedLines('- Un\r\n* Deux\n\n3. Trois\n  • Quatre  \n1) Cinq\nSix-sept')).toEqual(['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six-sept'])
    expect(pastedLines('Une seule ligne')).toEqual(['Une seule ligne'])
  })
})

describe('grouped undo that has to wait', () => {
  it('keeps what comes after an await in the same step', async () => {
    const s = undoStack()
    const seen: string[] = []
    await s.group('both', async () => {
      s.push('', '1', () => seen.push('undo1'), () => {})
      await Promise.resolve()
      s.push('', '2', () => seen.push('undo2'), () => {})
    })
    s.undo()
    expect(seen).toEqual(['undo2', 'undo1'])
    expect(s.undo()).toBeNull()
  })
})

describe('comments beside the text', () => {
  const comment = (id: string, quote: string, at?: number) => ({ id, quote, text: id, date: '2026-11-04', at })
  it('puts them in reading order and sets aside those whose passage is gone', () => {
    const { placed, orphans } = placeComments('Un chat. Un chien. Un chat.', [comment('c', 'chien'), comment('a', 'Un chat'), comment('x', 'un loup')])
    expect(placed.map(p => [p.comment.id, p.at])).toEqual([['a', 0], ['c', 12]])
    expect(orphans.map(c => c.id)).toEqual(['x'])
    expect(placeComments('Un chat. Un chat.', [comment('b', 'Un chat', 12)]).placed[0].at).toBe(9)
    expect(placeComments('Texte', undefined)).toEqual({ placed: [], orphans: [] })
  })
  it('keeps each card level with its passage unless the one above is in the way', () => {
    expect(stackCards([{ y: 10, height: 30 }, { y: 100, height: 20 }])).toEqual([10, 100])
    expect(stackCards([{ y: 10, height: 30 }, { y: 20, height: 20 }, { y: 40, height: 10 }], 6)).toEqual([10, 46, 72])
  })
})

describe('unwritten scenes', () => {
  const b = scene('b', ' ', { beats: ['Un'] }), a = scene('a', 'Texte'), c = scene('c', 'Texte'), d = scene('d', '', { note: 'Note' }), e = scene('e', ''), f = scene('f', '', { beats: ['Deux'] })
  const ids = (places: Map<number, Scene[]>) => [...places].map(([at, list]) => [at, list.map(s => s.id)])
  it('knows which scenes have a plan', () => {
    expect([b, d, e, scene('x', '', { note: '  ', beats: [] })].map(hasPlan)).toEqual([true, true, false, false])
  })
  it('puts each one after the page where the text before it stops', () => {
    const pages = [
      { opening: { chapter: 'c1' }, blocks: [{ sceneId: 'a' }] },
      { opening: null, blocks: [{ sceneId: 'a' }, { sceneId: 'c' }] },
      { opening: { chapter: 'c2' }, blocks: [] },
    ]
    expect(ids(unwrittenPlaces([{ id: 'c1', scenes: [b, a, c, d, e] }, { id: 'c2', scenes: [f] }], pages))).toEqual([[0, ['b']], [1, ['d']], [2, ['f']]])
  })
  it('puts them before the first page when no page says where', () => {
    expect(ids(unwrittenPlaces([{ id: 'c1', scenes: [d, f] }], [{ opening: null, blocks: [] }]))).toEqual([[-1, ['d', 'f']]])
  })
})

describe('draft mode', () => {
  const start = (doc: string, back: DraftBack = 'word') => EditorState.create({ doc, selection: { anchor: doc.length }, extensions: EditorState.transactionFilter.of(tr => forwardOnly(tr, back)) })
  const after = (s: EditorState, from: number, to: number, insert: string, userEvent?: string) => s.update({ changes: { from, to, insert }, userEvent }).state
  it('knows where the word being written starts', () => {
    expect([wordStart('Un chat'), wordStart('Un chat '), wordStart('Un\nchat'), wordStart('chat'), wordStart('')]).toEqual([3, 8, 3, 0, 0])
  })
  it('adds what is typed at the end, wherever the caret was', () => {
    expect(after(start('Un chat'), 7, 7, ' noir', 'input.type').doc.toString()).toBe('Un chat noir')
    const moved = after(start('Un chat'), 2, 2, 'x', 'input.type')
    expect(moved.doc.toString()).toBe('Un chatx')
    expect(moved.selection.main.head).toBe(8)
    expect(after(start('Un chat'), 0, 2, 'x', 'input.lt').doc.toString()).toBe('Un chat')
  })
  it('keeps the caret at the end', () => {
    const s = start('Un chat')
    expect(s.update({ selection: { anchor: 2 }, userEvent: 'select.pointer' }).state.selection.main.head).toBe(7)
    const all = s.update({ selection: { anchor: 0, head: 7 }, userEvent: 'select' }).state.selection.main
    expect([all.empty, all.head]).toEqual([true, 7])
  })
  it('lets Backspace erase the word being written and nothing before it', () => {
    expect(after(start('Un chat'), 6, 7, '', 'delete.backward').doc.toString()).toBe('Un cha')
    expect(after(start('Un chat'), 3, 7, '', 'delete.backward').doc.toString()).toBe('Un ')
    expect(after(start('Un chat'), 1, 7, '', 'delete.backward').doc.toString()).toBe('Un chat')
    expect(after(start('Un chat '), 7, 8, '', 'delete.backward').doc.toString()).toBe('Un chat ')
    expect(after(start('Un\n'), 2, 3, '', 'delete.backward').doc.toString()).toBe('Un\n')
    expect(after(start('Un chat', 'none'), 6, 7, '', 'delete.backward').doc.toString()).toBe('Un chat')
  })
  it('refuses moving lines', () => {
    expect(after(start('Un\nchat'), 0, 3, '', 'move.line').doc.toString()).toBe('Un\nchat')
  })
  it('lets typography, Claude, capture lines and other changes through', () => {
    expect(after(start('Un chat '), 7, 8, '\u00a0?', 'input.type').doc.toString()).toBe('Un chat\u00a0?')
    expect(after(start('Un chat'), 7, 7, ' noir', 'input.ai').doc.toString()).toBe('Un chat noir')
    expect(after(start('::idea\nUn chat'), 0, 7, '', 'delete.capture').doc.toString()).toBe('Un chat')
    expect(after(start('Un chat'), 0, 2, 'Le').doc.toString()).toBe('Le chat')
  })
})

describe('the grid', () => {
  const sheet = () => {
    const a = makeTile('tile', 0, 0, { id: 'a' }), b = makeTile('note', 400, 0, { id: 'b' }), c = makeTile('label', 0, 400, { id: 'c' })
    return connect(connect({ ...makeSheet('Une'), tiles: [a, b, c] }, 'a', 'b'), 'b', 'c')
  }
  it('keeps tiles on its cells', () => {
    expect(snap(CELL * 3 + 4)).toBe(CELL * 3)
    expect(makeTile('tile', 33, 7)).toMatchObject({ x: 40, y: 0, kind: 'tile', text: '' })
    const moved = moveTiles(sheet(), ['a', 'c'], 33, -7)
    expect(moved.tiles.map(t => [t.id, t.x, t.y])).toEqual([['b', 400, 0], ['a', 40, 0], ['c', 40, 400]])
    expect(resizeTile(sheet(), 'a', 10, 133).tiles[0]).toMatchObject({ w: 60, h: 140 })
  })
  it('draws one line between two tiles, whichever way', () => {
    const s = sheet()
    expect(s.links.map(l => [l.a, l.b])).toEqual([['a', 'b'], ['b', 'c']])
    expect(connect(s, 'b', 'a')).toBe(s)
    expect(connect(s, 'a', 'a')).toBe(s)
    expect(connect(s, 'a', 'nobody')).toBe(s)
    expect(removeLink(s, s.links[0].id).links.map(l => l.a)).toEqual(['b'])
  })
  it('takes a tile\'s lines away with it', () => {
    const s = removeTiles(sheet(), ['b'])
    expect(s.tiles.map(t => t.id)).toEqual(['a', 'c'])
    expect(s.links).toEqual([])
  })
  it('copies tiles with the lines among them, under new ids', () => {
    const s = sheet()
    const clip = copyTiles(s, ['a', 'b'])
    expect(clip.links.map(l => [l.a, l.b])).toEqual([['a', 'b']])
    const { sheet: pasted, ids } = pasteTiles(s, clip)
    expect(pasted.tiles).toHaveLength(5)
    expect(ids.some(id => ['a', 'b', 'c'].includes(id))).toBe(false)
    expect(pasted.tiles.find(t => t.id === ids[0])).toMatchObject({ x: CELL, y: CELL })
    expect(pasted.links[2]).toMatchObject({ a: ids[0], b: ids[1] })
    expect(pasteTiles(s, clip, { x: 1000, y: 1000 }).sheet.tiles[3]).toMatchObject({ x: 1000, y: 1000 })
  })
  it('layers, selects by box and finds room', () => {
    const s = sheet()
    expect(layerTiles(s, ['a'], true).tiles.map(t => t.id)).toEqual(['b', 'c', 'a'])
    expect(layerTiles(s, ['c'], false).tiles.map(t => t.id)).toEqual(['c', 'a', 'b'])
    expect(boundsOf(s.tiles)).toEqual({ x: 0, y: 0, w: 560, h: 440 })
    expect(boundsOf([])).toEqual({ x: 0, y: 0, w: 0, h: 0 })
    expect(boxBetween({ x: 10, y: 50 }, { x: 0, y: 20 })).toEqual({ x: 0, y: 20, w: 10, h: 30 })
    expect(tilesInBox(s, { x: 100, y: 100, w: 400, h: 400 })).toEqual(['a', 'b', 'c'])
    expect(tilesInBox(s, { x: 300, y: 300, w: 10, h: 10 })).toEqual([])
    const spot = freeSpot(s, 220, 120)
    expect(s.tiles.some(t => overlaps(t, { ...spot, w: 220, h: 120 }))).toBe(false)
    expect(freeSpot(makeSheet('Vide'), 220, 120)).toEqual({ x: 0, y: 0 })
  })
  it('runs a line between the edges of its tiles', () => {
    expect(linkEnds({ x: 0, y: 0, w: 100, h: 100 }, { x: 300, y: 0, w: 100, h: 100 })).toEqual({ x1: 100, y1: 50, x2: 300, y2: 50 })
    expect(linkEnds({ x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 300, w: 100, h: 100 })).toEqual({ x1: 50, y1: 100, x2: 50, y2: 300 })
  })
  it('reads what it can of a file', () => {
    expect(readSheets(null)).toEqual([])
    expect(readSheets({ sheets: 'x' })).toEqual([])
    const read = readSheets({ sheets: [
      { id: 's', name: 'Une', tiles: [{ id: 'a', x: 0, y: 0, w: 1, h: 1, kind: 'tile', text: '' }, { id: 'b', x: 'non' }], links: [{ id: 'l', a: 'a', b: 'b' }] },
      { name: 'sans id', tiles: [] },
    ] })
    expect(read).toHaveLength(1)
    expect(read[0].tiles.map(t => t.id)).toEqual(['a'])
    expect(read[0].links).toEqual([])
  })
})

describe('exporting the bible and the outline', () => {
  const book = () => {
    const b = bookOf([scene('s1', 'Texte.', { title: 'L’arrivée', note: 'Elle arrive.', beats: ['Le bal', 'La fuite'] })], [
      entry({ slug: 'marc', name: 'Marc', type: 'character', rank: 'secondary', short: 'Le traître.' }),
      entry({ slug: 'elise', name: 'Élise', type: 'character', rank: 'main', aliases: ['Élise', 'Éli!'], short: 'La duchesse.', full: '### Rôle\n\nHéroïne.', fields: { Âge: '19' }, facts: [{ from: 3, to: 5, text: 'Blessée' }, { from: null, to: null, text: 'Née à Valombre' }], links: ['marc', 'gone'], notes: 'Pour moi seul.' }),
      entry({ slug: 'cle', name: 'La clé', type: 'object', include: 'secret', short: 'Cachée.' }),
      entry({ slug: 'style', name: 'Style', type: 'style', short: 'Sec.' }),
    ], 'fr')
    return { ...b, meta: { ...b.meta, fields: { character: [{ name: 'Âge' }] } } }
  }

  it('gives the bible by type of entry, the main characters first', () => {
    const md = bibleMarkdown(book(), {}, s => s === 'Characters' ? 'Personnages' : s)
    expect(md.indexOf('## Personnages')).toBeGreaterThan(0)
    expect(md.indexOf('### Élise')).toBeLessThan(md.indexOf('### Marc'))
    expect(md).toContain('**Aussi appelé :** Éli')
    expect(md).toContain('**Âge :** 19')
    expect(md).toContain('#### Rôle')
    expect(md).toContain('- *ch. 3–5 :* Blessée')
    expect(md).toContain('- Née à Valombre')
    expect(md).toContain('**Liens :** Marc\n')
  })

  it('leaves out what is secret, private or not the bible, unless asked', () => {
    const md = bibleMarkdown(book())
    expect(md).not.toContain('Pour moi seul')
    expect(md).not.toContain('La clé')
    expect(md).not.toContain('Sec.')
    const all = bibleMarkdown(book(), { secret: true, notes: true })
    expect(all).toContain('**Notes privées :** Pour moi seul.')
    expect(all).toContain('## Objects')
    expect(all).toContain('### La clé')
    expect(all).not.toContain('Sec.')
  })

  it('makes Word from the Markdown: headings, lists, paragraphs', async () => {
    const files = await readZip(await markdownToDocx('# T & co\n\n## Sec\n\n### Nom\n\n#### Bloc\n\n##### Plus bas\n\n**A :** b\n\n- un\n1. deux\n*But :* trois', book()))
    const xml = fromUtf8(files.get('word/document.xml')!)
    const styleOf = (text: string) => xml.split('</w:p>').find(p => p.includes(`>${text}<`))?.match(/w:pStyle w:val="(\w+)"/)?.[1]
    expect(styleOf('T &amp; co')).toBe('Title')
    expect(styleOf('Sec')).toBe('Heading1')
    expect(styleOf('Nom')).toBe('Heading2')
    expect(styleOf('Bloc')).toBe('Heading3')
    expect(styleOf('Plus bas')).toBe('Heading3')
    expect(styleOf('un')).toBe('Item')
    expect(xml).toContain('<w:r><w:t>1.</w:t><w:tab/></w:r>')
    expect(styleOf(' trois')).toBe('Body')
    expect(xml).toContain('<w:b/></w:rPr><w:t xml:space="preserve">A :</w:t>')
    expect(files.has('word/footer1.xml')).toBe(true)
  })

  it('still writes the book in Word, with its header', async () => {
    const b = book()
    const en = { ...b, meta: { ...b.meta, language: 'en' as const, author: 'Ann Lee', title: 'Ash' } }
    const files = await readZip(await toDocx(en, { format: 'docx', layout: 'submission', titlePage: true, sceneBreak: '#' }))
    expect(fromUtf8(files.get('word/header1.xml')!)).toContain('Lee / ASH / ')
    expect(fromUtf8(files.get('word/document.xml')!)).toContain('Texte.')
  })

  it('writes the outline’s labels in the book’s language', () => {
    const b = book()
    const c = b.chapters[0]
    const chapters = [{ ...c, goal: 'Entrer', scenes: c.scenes.map(s => ({ ...s, pace: 'Lent' })) }]
    expect(outlineMarkdown({ ...b, chapters })).toContain('*But :* Entrer')
    const en = outlineMarkdown({ ...b, chapters, meta: { ...b.meta, language: 'en' } })
    expect(en).toContain('*Goal:* Entrer')
    expect(en).toContain('*Pace:* Lent')
    expect(en).toContain('1. Le bal')
  })
})

describe('hunksOf', () => {
  it('places each change at its spot in the text', () => {
    expect(hunksOf(diffWords('Elle marche vers la porte.', 'Elle court vers la porte.'), 10)).toEqual([{ from: 15, to: 21, insert: 'court' }])
  })
  it('joins changes separated by a space or a short word', () => {
    expect(hunksOf([{ kind: 'del', text: 'a' }, { kind: 'add', text: 'b' }, { kind: 'same', text: ' de ' }, { kind: 'del', text: 'c' }, { kind: 'add', text: 'd' }])).toEqual([{ from: 0, to: 6, insert: 'b de d' }])
  })
  it('keeps changes apart across a longer passage or a new paragraph', () => {
    expect(hunksOf([{ kind: 'del', text: 'a' }, { kind: 'same', text: ' tout le reste ' }, { kind: 'add', text: 'b' }])).toEqual([{ from: 0, to: 1, insert: '' }, { from: 16, to: 16, insert: 'b' }])
    expect(hunksOf([{ kind: 'del', text: 'a' }, { kind: 'same', text: '\n' }, { kind: 'add', text: 'b' }])).toHaveLength(2)
  })
  it('leaves out a space that only became non-breaking', () => {
    expect(hunksOf([{ kind: 'same', text: 'a' }, { kind: 'del', text: ' ' }, { kind: 'add', text: ' ' }, { kind: 'same', text: 'bonjour à tous' }])).toEqual([])
  })
  it('finds nothing when nothing changed', () => {
    expect(hunksOf(diffWords('Même texte.', 'Même texte.'))).toEqual([])
  })
  it('applied from the end, gives the new text', () => {
    const a = 'Il pleut sur la ville et le vent tourne. Marc se tait.', b = 'Il pleut sur Valombre et le vent se lève. Marc se tait longtemps.'
    let out = a
    for (const h of hunksOf(diffWords(a, b)).reverse()) out = out.slice(0, h.from) + h.insert + out.slice(h.to)
    expect(out).toBe(b)
  })
})

describe('what waits in the book', () => {
  const book = {
    meta: { loose: [{ id: 'i', title: 'Duel', note: 'sur le toit' }] },
    chapters: [{ scenes: [{ id: 's', title: 'Le bal', text: 'Elle ⟦décrire la salle⟧ entra. Marc rit.', comments: [{ id: 'c', quote: 'Marc rit', text: 'Trop tôt', date: '', at: 0 }, { id: 'd', quote: 'plus là', text: 'Perdu', date: '', at: 0 }] }] }],
  } as unknown as Book
  it('lists ideas, placeholders and comments, with where each one is', () => {
    const list = waitingInBook(book)
    expect(list.map(w => w.kind)).toEqual(['idea', 'placeholder', 'comment', 'comment'])
    expect(list[0]).toMatchObject({ text: 'Duel : sur le toit' })
    expect(list[1]).toMatchObject({ text: 'décrire la salle', sceneId: 's', from: 5, to: 23 })
    expect(list[2]).toMatchObject({ text: 'Trop tôt', from: 31, to: 39 })
    expect(list[3]).toMatchObject({ text: 'Perdu', lost: true })
  })
})

describe('board keys', () => {
  const ch = (id: string, ...scenes: string[]) => ({ id, scenes: scenes.map(s => ({ id: s })) }) as unknown as Chapter
  const book = [ch('a', '1', '2'), ch('empty'), ch('b', '3')]
  it('arrows go to the next card, over empty chapters', () => {
    expect(boardNeighbour(book, '1', 'down')).toBe('2')
    expect(boardNeighbour(book, '1', 'up')).toBeNull()
    expect(boardNeighbour(book, '2', 'right')).toBe('3')
    expect(boardNeighbour(book, '3', 'left')).toBe('1')
    expect(boardNeighbour(book, '3', 'right')).toBeNull()
  })
  it('Alt+arrows say where the card lands', () => {
    expect(boardMove(book, '2', 'up')).toEqual({ chapterId: 'a', index: 0 })
    expect(boardMove(book, '1', 'down')).toEqual({ chapterId: 'a', index: 1 })
    expect(boardMove(book, '2', 'down')).toEqual({ chapterId: 'empty', index: 0 })
    expect(boardMove(book, '3', 'up')).toEqual({ chapterId: 'empty', index: 0 })
    expect(boardMove(book, '2', 'right')).toEqual({ chapterId: 'empty', index: 0 })
    expect(boardMove(book, '1', 'up')).toBeNull()
    expect(boardMove(book, '3', 'right')).toBeNull()
  })
})

describe('backups', () => {
  const day = (i: number) => new Date(Date.UTC(2026, 10, 10) - i * 864e5).toISOString().slice(0, 10) + '.zip'
  it('keeps the last ten whatever their age', () => {
    // Ten backups spread over a year (the book wasn't opened for months): none goes.
    const sparse = Array.from({ length: 10 }, (_, i) => day(i * 30))
    expect(backupsToRemove(sparse)).toEqual([])
  })
  it('keeps one a week after the last ten, and leaves other files alone', () => {
    const daily = [...Array.from({ length: 40 }, (_, i) => day(i)), 'notes.txt']
    const gone = backupsToRemove(daily)
    const kept = daily.filter(n => !gone.includes(n) && n.endsWith('.zip'))
    expect(kept.slice(0, 10)).toEqual(daily.slice(0, 10))
    expect(kept.length).toBeLessThan(18)
    expect(gone).not.toContain('notes.txt')
  })
  it('keeps every version of the last week, then one a day, then one a month', () => {
    const now = Date.UTC(2026, 10, 10, 12)
    const at = (days: number, h: number) => new Date(now - days * 864e5 - h * 36e5).toISOString().replace(/[:.]/g, '-') + '.md'
    const names = [at(1, 1), at(1, 2), at(10, 1), at(10, 2), at(200, 1), at(205, 1), 'notes.md']
    expect(versionsToRemove(names, now).sort()).toEqual([at(10, 2), at(205, 1)].sort())
  })
})

describe('the plan, connected', () => {
  const line = entry({ slug: 'heist', type: 'storyline', name: 'The heist', short: 'They rob the vault.' })
  const b = bookOf([scene('a', '')], [line])
  it('reads story time and story lines from Claude’s cards, and shows them back to it', () => {
    const ch = b.chapters[0]
    const card = readCard(b, ch, { id: 'a', title: 'Vault', summary: 'They break in.', time: 'Day 3, night', lines: ['The heist', 'Unknown line'] })
    expect(card.time).toBe('Day 3, night')
    expect(card.lines).toEqual(['heist'])
    const patched = { ...ch.scenes[0], ...cardPatch(card, ch.scenes[0]) }
    expect(sceneText(b, patched)).toContain('[Day 3, night]')
    expect(sceneText(b, patched)).toContain('Lines: The heist')
  })
  it('tells Claude the book’s own chapter length', () => {
    expect(outlineRules('en', { kind: 'one' }, [5000, 6000])).toContain('about 5,000 to 6,000 words')
    expect(outlineRules('fr', { kind: 'one' })).toContain('environ 3')
  })
})

describe('EPUB identity and cover', () => {
  it('keeps the book’s UUID and puts the cover first', async () => {
    const { toEpub } = await import('./export')
    const { readZip, fromUtf8 } = await import('./zip')
    const b = bookOf([scene('a', 'Il pleuvait.')], [])
    const zip = await readZip(await toEpub(b, { format: 'epub', layout: 'book', titlePage: true, sceneBreak: '* * *', uuid: '0b8f6f2e-6c0a-4d3e-9a59-0d3c1f7e2a11', cover: { data: new Uint8Array([1, 2, 3]), type: 'image/png' } }))
    const opf = fromUtf8(zip.get('OEBPS/content.opf')!)
    expect(opf).toContain('urn:uuid:0b8f6f2e-6c0a-4d3e-9a59-0d3c1f7e2a11')
    expect(opf).toContain('properties="cover-image"')
    expect(opf.indexOf('idref="cover"')).toBeLessThan(opf.indexOf('idref="title"'))
    expect(zip.has('OEBPS/cover.png')).toBe(true)
  })
})
