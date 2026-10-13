// Shapes of a book as Plume holds it in memory. On disk a book is a folder of
// Markdown files (see project.ts); nothing here is stored as-is.

export type Lang = 'fr' | 'en'

export type EntryType =
  | 'character' | 'place' | 'object' | 'lore' | 'faction' | 'storyline' | 'theme' | 'style'

export type Include = 'auto' | 'always' | 'never'

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
    en: ['Role', 'Appearance', 'Personality', 'Voice', 'Goals', 'Secrets', 'Arc'],
    fr: ['Rôle', 'Apparence', 'Personnalité', 'Voix', 'Objectifs', 'Secrets', 'Évolution'] } },
  { type: 'place', folder: 'places', label: 'Place', plural: 'Places', headings: {
    en: ['Description', 'Atmosphere', 'Inhabitants', 'Senses'],
    fr: ['Description', 'Atmosphère', 'Habitants', 'Sensations'] } },
  { type: 'object', folder: 'objects', label: 'Object', plural: 'Objects', headings: {
    en: ['Appearance', 'Use or powers', 'History'],
    fr: ['Apparence', 'Usage ou pouvoirs', 'Histoire'] } },
  { type: 'lore', folder: 'lore', label: 'Lore & rules', plural: 'Lore & rules', headings: {
    en: ['The rule', 'Its limits', 'Exceptions'],
    fr: ['La règle', 'Ses limites', 'Exceptions'] } },
  { type: 'faction', folder: 'factions', label: 'Faction', plural: 'Factions', headings: {
    en: ['Goals', 'Members', 'Conflicts'],
    fr: ['Objectifs', 'Membres', 'Conflits'] } },
  { type: 'storyline', folder: 'storylines', label: 'Story line', plural: 'Story lines', headings: {
    en: ['Stakes', 'Turning points', 'Resolution'],
    fr: ['Enjeux', 'Tournants', 'Résolution'] } },
  { type: 'theme', folder: 'themes', label: 'Theme', plural: 'Themes', headings: {
    en: ['Meaning', 'Motifs'],
    fr: ['Sens', 'Motifs'] } },
  { type: 'style', folder: '', label: 'Style guide', plural: 'Style guide', headings: {
    en: ['Voice', 'Tense', 'POV rules', 'Words to avoid'],
    fr: ['Voix', 'Temps', 'Point de vue', 'Mots à éviter'] } },
]

export const typeInfo = (t: EntryType) => ENTRY_TYPES.find(x => x.type === t)!

/** A fact true only for a range of chapters; null bounds are open. */
export interface Fact {
  from: number | null
  to: number | null
  text: string
}

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
}

export type SceneStatus = 'draft' | 'revised' | 'done'

export interface Scene {
  id: string
  path: string
  title: string
  pov: string | null
  status: SceneStatus
  text: string
}

export interface Chapter {
  id: string
  folder: string
  kind: 'chapter' | 'prologue' | 'epilogue'
  title: string
  notes: string
  scenes: Scene[]
}

export type ActionId = 'continue' | 'rewrite' | 'beats'
export type Model = 'haiku' | 'sonnet' | 'opus'
export type Effort = 'low' | 'medium' | 'high'

export interface ActionSettings {
  model: Model
  effort: Effort
}

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
  },
  bibleBudget: 3000,
  storyWindow: 1500,
  continueWords: 300,
  beatsWords: 600,
}
