// Shapes of a book as Plume holds it in memory. On disk a book is a folder of
// Markdown files (see project.ts); nothing here is stored as-is.

export type Lang = 'fr' | 'en'

export type EntryType =
  | 'character' | 'place' | 'object' | 'lore' | 'magic' | 'creature' | 'event' | 'faction' | 'storyline' | 'theme' | 'wordlist' | 'excerpt' | 'style'

/** Entry types that describe the story world: what outlines and structure suggestions are given. */
export const WORLD_TYPES: EntryType[] = ['character', 'place', 'faction', 'storyline', 'lore', 'magic', 'creature', 'event']

/** Secret: never sent to the AI, not even when @-mentioned. */
export type Include = 'auto' | 'always' | 'never' | 'secret'

export interface EntryTypeInfo {
  type: EntryType
  folder: string
  label: string
  plural: string
  /** Section headings for a new entry, in the book's language. */
  headings: Record<'en' | 'fr', string[]>
}

export const ENTRY_TYPES: EntryTypeInfo[] = [
  { type: 'character', folder: 'characters', label: 'Character', plural: 'Characters', headings: {
    en: ['Role', 'Appearance', 'Personality', 'Goals', 'Secrets', 'Arc'],
    fr: ['Rôle', 'Apparence', 'Personnalité', 'Objectifs', 'Secrets', 'Évolution'] } },
  { type: 'place', folder: 'places', label: 'Place', plural: 'Places', headings: {
    en: ['Description', 'Atmosphere', 'Inhabitants', 'Senses'],
    fr: ['Description', 'Atmosphère', 'Habitants', 'Sensations'] } },
  { type: 'object', folder: 'objects', label: 'Object', plural: 'Objects', headings: {
    en: ['Appearance', 'Use or powers', 'History'],
    fr: ['Apparence', 'Usage ou pouvoirs', 'Histoire'] } },
  { type: 'lore', folder: 'lore', label: 'Lore & rules', plural: 'Lore & rules', headings: {
    en: ['The rule', 'Its limits', 'Exceptions'],
    fr: ['La règle', 'Ses limites', 'Exceptions'] } },
  { type: 'magic', folder: 'magic', label: 'Magic & powers', plural: 'Magic & powers', headings: {
    en: ['How it works', 'The cost', 'Limits', 'Who can use it', 'Signs and effects'],
    fr: ['Fonctionnement', 'Le prix', 'Limites', 'Qui peut l’utiliser', 'Signes et effets'] } },
  { type: 'creature', folder: 'creatures', label: 'Creature', plural: 'Bestiary', headings: {
    en: ['Appearance', 'Abilities', 'Weaknesses', 'Habitat and behaviour', 'In the story'],
    fr: ['Apparence', 'Capacités', 'Faiblesses', 'Habitat et comportement', 'Dans l’histoire'] } },
  { type: 'event', folder: 'history', label: 'Event or era', plural: 'History & events', headings: {
    en: ['What happened', 'When', 'Who was involved', 'Consequences today'],
    fr: ['Ce qui s’est passé', 'Quand', 'Qui était impliqué', 'Conséquences aujourd’hui'] } },
  { type: 'faction', folder: 'factions', label: 'Faction', plural: 'Factions', headings: {
    en: ['Goals', 'Members', 'Conflicts'],
    fr: ['Objectifs', 'Membres', 'Conflits'] } },
  { type: 'storyline', folder: 'storylines', label: 'Story line', plural: 'Story lines', headings: {
    en: ['Stakes', 'Turning points', 'Resolution'],
    fr: ['Enjeux', 'Tournants', 'Résolution'] } },
  { type: 'theme', folder: 'themes', label: 'Theme', plural: 'Themes', headings: {
    en: ['Meaning', 'Motifs'],
    fr: ['Sens', 'Motifs'] } },
  // One word or phrase per line; banned from AI text and flagged by the rule checker.
  { type: 'wordlist', folder: 'wordlists', label: 'Word list', plural: 'Word lists', headings: { en: [], fr: [] } },
  // A passage of the author's own prose, sent as an example of their voice.
  { type: 'excerpt', folder: 'excerpts', label: 'Excerpt of your prose', plural: 'Your excerpts', headings: { en: [], fr: [] } },
  { type: 'style', folder: '', label: 'Style guide', plural: 'Style guide', headings: {
    en: ['Voice', 'Tense', 'POV rules', 'Words to avoid'],
    fr: ['Voix', 'Temps', 'Point de vue', 'Mots à éviter'] } },
]

export const typeInfo = (t: EntryType) => ENTRY_TYPES.find(x => x.type === t)!

/** How the bible list groups entry types. Voice materials (word lists, excerpts,
 *  the style guide) are not here: they live in Settings → Voice. */
export const FAMILIES: { id: string; label: string; types: EntryType[] }[] = [
  { id: 'people', label: 'People', types: ['character'] },
  { id: 'places', label: 'Places', types: ['place'] },
  { id: 'things', label: 'Things', types: ['object', 'creature'] },
  { id: 'lore', label: 'Lore', types: ['lore', 'magic', 'event', 'faction', 'theme'] },
  { id: 'storylines', label: 'Story lines', types: ['storyline'] },
]
export const VOICE_TYPES: EntryType[] = ['style', 'wordlist', 'excerpt']
export const familyOf = (t: EntryType) => FAMILIES.find(f => f.types.includes(t))?.id ?? null

/** A fact true only for a range of chapters (of one book of a series); null bounds are open. */
export interface Fact {
  from: number | null
  to: number | null
  /** Book of the series the range belongs to; null = this book. */
  book?: number | null
  text: string
}

/** How a character speaks: always sent when the character is in the scene. */
export interface VoiceCard {
  register: string
  sentences: string
  tic: string
  gesture: string
  never: string
  inner: string
  lines: string
}

export const EMPTY_VOICE: VoiceCard = { register: '', sentences: '', tic: '', gesture: '', never: '', inner: '', lines: '' }

export type ExcerptKind = 'any' | 'dialogue' | 'action' | 'description' | 'introspection'

export interface Entry {
  slug: string
  type: EntryType
  path: string
  name: string
  aliases: string[]
  include: Include
  links: string[]
  short: string
  full: string
  facts: Fact[]
  /** Characters: their voice, and what they know and don't (for POV scenes). */
  voice?: VoiceCard
  knows?: string
  unaware?: string
  /** Your own notes on the entry: kept in the file, never sent to the AI. */
  notes?: string
  /** What the AI may read of each block (### Heading) of the full text; unlisted blocks go with the full version. */
  sends?: Record<string, 'always' | 'full' | 'never'>
  /** Free labels to filter the bible by ("act 2", "villains"). */
  tags?: string[]
  /** A picture in the book folder (bible/images/...). */
  image?: string
  /** Excerpts: the kind of passage it shows. */
  kind?: ExcerptKind
  /** Story lines: resolved or still open. */
  resolved?: boolean
  /** Shared with every book of the series (lives in the series folder). */
  shared?: boolean
  /** Frontmatter keys Plume doesn't know, kept as they were. */
  extra: Record<string, unknown>
}

export type SceneStatus = 'draft' | 'revised' | 'done'

/** A note pinned to a passage of a scene, found again by its quote. */
export interface Comment {
  id: string
  quote: string
  text: string
  date: string
  /** Where the quote was when last seen (moves with the text), to tell apart repeats of the same words. */
  at?: number
}

export interface Scene {
  id: string
  path: string
  title: string
  pov: string | null
  status: SceneStatus
  text: string
  /** The plan card's note: what happens. Shown in grey, used by Beats to prose. */
  note?: string
  /** Story time, free text ("Day 3, 22:00"), and place (a bible slug). */
  time?: string
  place?: string | null
  /** Story lines (bible slugs) this scene moves forward. */
  lines?: string[]
  /** Short summary made by the AI, and the text hash it was made from. */
  summary?: string
  summaryOf?: string
  /** How tense the scene is, 0 to 10 (rated by Claude from the summaries, or by you). */
  tension?: number
  /** Revision passes (ids of meta.passes) already done on this scene. */
  passes?: string[]
  comments?: Comment[]
  extra: Record<string, unknown>
}

export interface Chapter {
  id: string
  folder: string
  kind: 'chapter' | 'prologue' | 'epilogue'
  title: string
  notes: string
  summary?: string
  summaryOf?: string
  /** Title of a part of the book that starts with this chapter (exports put a part page before it). */
  part?: string
  scenes: Scene[]
}

export type ActionId = 'continue' | 'rewrite' | 'beats' | 'fill' | 'expand' | 'shorten' | 'show' | 'dialogue' | 'describe'
/** Actions that replace the selected passage (the others write at the cursor). */
export const REWRITE_ACTIONS: ActionId[] = ['rewrite', 'expand', 'shorten', 'show', 'dialogue']
export const isRewrite = (a: ActionId) => REWRITE_ACTIONS.includes(a)
export type Model = 'haiku' | 'sonnet' | 'opus'
export type Effort = 'low' | 'medium' | 'high'

export interface ActionSettings {
  model: Model
  effort: Effort
  /** A model preset (Settings → Claude); when set it decides the model, and OpenRouter ones run there. */
  preset?: string
}

/** Measurable rules the proposals are checked against, without the AI. */
export interface Rules {
  passiveMax: number // % of sentences
  adverbsPer250: number
  dialogueMaxWords: number // longest dialogue line
  sentenceMaxWords: number
  dashDialogue: boolean // dialogue lines open with an em dash
}

export const DEFAULT_RULES: Rules = { passiveMax: 2, adverbsPer250: 1, dialogueMaxWords: 60, sentenceMaxWords: 45, dashDialogue: true }

export type SceneRule = 'medias-res' | 'hook' | 'no-weather' | 'no-reminiscing' | 'show' | 'no-summary'

export interface Voice {
  /** Prompt from the library for every action, and per-action overrides. */
  prompt: string
  actionPrompts: Partial<Record<ActionId, string>>
  tense: string
  adult: boolean
  sceneRules: SceneRule[]
  rules: Rules
  /** The author's voice in a few lines, written once by the AI from the excerpts. */
  description: string
  /** What the accepted and rejected proposals taught, in a few lines. */
  taste: string
  /** Copies of the prompts this book uses, so it works on a computer that lacks your library. */
  snapshots: Record<string, { name: string; text: string }>
  /** Which default preset this voice was set up from (so it is applied once, not again). */
  defaults?: string
}

export const DEFAULT_VOICE: Voice = {
  prompt: '', actionPrompts: {}, tense: '', adult: false, sceneRules: [], rules: DEFAULT_RULES, description: '', taste: '', snapshots: {},
}

export type MatterKey = 'copyright' | 'dedication' | 'epigraph' | 'acknowledgments' | 'about'

export interface Beat { name: string; at: number; note: string; sceneId: string | null }
export interface LooseCard { id: string; title: string; note: string }

export interface BookMeta {
  format: 1
  title: string
  author: string
  language: Lang
  order: { folder: string; scenes: string[] }[]
  ai: {
    actions: Record<ActionId, ActionSettings>
    bibleBudget: number
    storyWindow: number
    continueWords: number
    beatsWords: number
  }
  voice: Voice
  structure: { template: string; beats: Beat[] }
  loose: LooseCard[]
  /** Words in the book at the end of each day: the progress chart and streak. */
  history: Record<string, number>
  goal: { book: number; daily: number }
  /** Folder of the series (relative to the book folder), and this book's number in it. */
  series: { path: string; index: number } | null
  /** Map image for the places, with pins in % of its size. */
  map: { image: string; pins: { slug: string; x: number; y: number }[] } | null
  /** Capitalised words you told Plume aren't bible names. */
  ignored: string[]
  /** Revision passes: what to check on each scene, in order. */
  passes?: { id: string; name: string }[]
  /** Front and back matter, printed around the chapters in exports. */
  matter?: Partial<Record<MatterKey, string>>
  /** Words you added to the dictionary, and LanguageTool rules you turned off. */
  dictionary?: string[]
  ltIgnored?: string[]
  summary?: string
}

export interface Book {
  root: string
  meta: BookMeta
  entries: Entry[]
  chapters: Chapter[]
}

export const DEFAULT_AI: BookMeta['ai'] = {
  actions: {
    continue: { model: 'sonnet', effort: 'low' },
    rewrite: { model: 'sonnet', effort: 'low' },
    beats: { model: 'sonnet', effort: 'medium' },
    fill: { model: 'sonnet', effort: 'low' },
    expand: { model: 'sonnet', effort: 'low' },
    shorten: { model: 'sonnet', effort: 'low' },
    show: { model: 'sonnet', effort: 'low' },
    dialogue: { model: 'sonnet', effort: 'low' },
    describe: { model: 'sonnet', effort: 'low' },
  },
  bibleBudget: 3000,
  storyWindow: 1500,
  continueWords: 300,
  beatsWords: 600,
}
