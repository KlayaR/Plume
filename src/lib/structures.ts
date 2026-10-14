// Plan helpers: story-structure templates with where each beat is expected
// (as a share of the book), and reading story time ("Day 3, 22:00") off cards.
import type { Book, Lang, Scene } from './types'
import { countWords, foldText } from './text'

export interface Template { id: string; name: string; beats: { en: string; fr: string; at: number }[] }

const b = (en: string, fr: string, at: number) => ({ en, fr, at })

export const TEMPLATES: Template[] = [
  { id: 'three-acts', name: 'Three Acts', beats: [
    b('Setup', 'Exposition', 0), b('Inciting incident', 'Élément déclencheur', 10), b('First plot point', 'Premier tournant', 25),
    b('Midpoint', 'Point médian', 50), b('Second plot point', 'Deuxième tournant', 75), b('Climax', 'Climax', 90), b('Resolution', 'Dénouement', 98)] },
  { id: 'hero', name: 'Hero’s Journey', beats: [
    b('Ordinary world', 'Monde ordinaire', 0), b('Call to adventure', 'Appel de l’aventure', 8), b('Refusal of the call', 'Refus de l’appel', 12),
    b('Meeting the mentor', 'Rencontre du mentor', 17), b('Crossing the threshold', 'Passage du seuil', 25), b('Tests, allies, enemies', 'Épreuves, alliés, ennemis', 35),
    b('Approach to the inmost cave', 'Approche de la caverne', 45), b('Ordeal', 'Épreuve suprême', 55), b('Reward', 'Récompense', 65),
    b('The road back', 'Chemin du retour', 75), b('Resurrection', 'Résurrection', 88), b('Return with the elixir', 'Retour avec l’élixir', 97)] },
  { id: 'save-the-cat', name: 'Save the Cat', beats: [
    b('Opening image', 'Image d’ouverture', 0), b('Theme stated', 'Thème énoncé', 5), b('Set-up', 'Mise en place', 5), b('Catalyst', 'Catalyseur', 10),
    b('Debate', 'Débat', 15), b('Break into two', 'Passage à l’acte II', 20), b('B story', 'Intrigue secondaire', 22), b('Fun and games', 'Promesse du concept', 30),
    b('Midpoint', 'Point médian', 50), b('Bad guys close in', 'Les méchants se rapprochent', 55), b('All is lost', 'Tout est perdu', 75),
    b('Dark night of the soul', 'Nuit noire de l’âme', 80), b('Break into three', 'Passage à l’acte III', 85), b('Finale', 'Final', 90), b('Final image', 'Image finale', 99)] },
  { id: 'story-circle', name: 'Story Circle', beats: [
    b('You: a character in a zone of comfort', 'Un personnage dans sa zone de confort', 0), b('Need: but they want something', 'Il désire quelque chose', 12),
    b('Go: they enter an unfamiliar situation', 'Il entre en terrain inconnu', 25), b('Search: adapt to it', 'Il s’adapte', 37),
    b('Find: get what they wanted', 'Il obtient ce qu’il voulait', 50), b('Take: pay a heavy price', 'Il en paie le prix', 62),
    b('Return: to their familiar situation', 'Il revient au familier', 75), b('Change: having changed', 'Il a changé', 90)] },
  { id: 'seven-point', name: 'Seven-Point', beats: [
    b('Hook', 'Accroche', 0), b('Plot turn 1', 'Premier retournement', 20), b('Pinch 1', 'Premier pincement', 35), b('Midpoint', 'Point médian', 50),
    b('Pinch 2', 'Second pincement', 65), b('Plot turn 2', 'Second retournement', 80), b('Resolution', 'Résolution', 97)] },
  { id: 'snowflake', name: 'Snowflake', beats: [
    b('First disaster', 'Premier désastre', 25), b('Second disaster', 'Deuxième désastre', 50), b('Third disaster', 'Troisième désastre', 75), b('Ending', 'Fin', 98)] },
  { id: 'kishotenketsu', name: 'Kishōtenketsu', beats: [
    b('Ki: introduction', 'Ki : introduction', 0), b('Shō: development', 'Shō : développement', 25), b('Ten: twist', 'Ten : retournement', 50), b('Ketsu: reconciliation', 'Ketsu : conclusion', 80)] },
]

export const templateBeats = (id: string, lang: Lang) =>
  (TEMPLATES.find(t => t.id === id)?.beats ?? []).map(x => ({ name: x[lang], at: x.at, note: '', sceneId: null as string | null }))

/** Does this beat usually peak or breathe? Read from its name (English or French). */
export function beatTension(name: string): 'high' | 'low' | null {
  const f = foldText(name)
  if (/ordinary world|monde ordinaire|opening image|image d.ouverture|set-?up|mise en place|exposition|resolution|denouement|final image|image finale|return with|retour avec|zone de confort|^ki|ketsu|theme/.test(f)) return 'low'
  if (/climax|ordeal|epreuve supreme|all is lost|tout est perdu|finale|^final$|^final |dark night|nuit noire|disaster|desastre|resurrection|pinch|pincement|midpoint|point median|plot point|plot turn|tournant|retournement|ten:/.test(f)) return 'high'
  return null
}

export interface BeatFlag { beat: string; sceneId: string; sceneTitle: string; tension: number; kind: 'calm' | 'tense' }

/** Beats placed on a scene whose rated tension disagrees with what the beat usually is. */
export function beatFlags(book: Book): BeatFlag[] {
  const scenes = new Map(book.chapters.flatMap(c => c.scenes).map(s => [s.id, s]))
  const out: BeatFlag[] = []
  for (const b of book.meta.structure.beats) {
    const s = b.sceneId ? scenes.get(b.sceneId) : undefined
    if (!s || s.tension === undefined) continue
    const kind = beatTension(b.name)
    if (kind === 'high' && s.tension < 5) out.push({ beat: b.name, sceneId: s.id, sceneTitle: s.title, tension: s.tension, kind: 'calm' })
    if (kind === 'low' && s.tension >= 8) out.push({ beat: b.name, sceneId: s.id, sceneTitle: s.title, tension: s.tension, kind: 'tense' })
  }
  return out
}

/** Where each scene starts and ends in the book, as a share of its words (0–100). */
export function scenePositions(book: Book): Map<string, { start: number; end: number }> {
  const scenes = book.chapters.flatMap(c => c.scenes)
  const counts = scenes.map(s => Math.max(1, countWords(s.text)))
  const total = counts.reduce((a, b2) => a + b2, 0) || 1
  const out = new Map<string, { start: number; end: number }>()
  let at = 0
  scenes.forEach((s, i) => { out.set(s.id, { start: (at / total) * 100, end: ((at + counts[i]) / total) * 100 }); at += counts[i] })
  return out
}

// --- Story time ------------------------------------------------------------------

export interface StoryTime { day: number | null; minutes: number | null }

const PART_OF_DAY: Record<string, number> = {
  minuit: 24 * 60 - 1, midnight: 24 * 60 - 1, aube: 6 * 60, dawn: 6 * 60, matin: 9 * 60, morning: 9 * 60,
  'apres-midi': 15 * 60, afternoon: 15 * 60, midi: 12 * 60, noon: 12 * 60, soir: 19 * 60, evening: 19 * 60, nuit: 23 * 60, night: 23 * 60,
}

/** Reads "Day 3, 22:00", "J3 22h30", "Jour 4, nuit"… Unknown parts are null. */
export function parseStoryTime(s: string | undefined): StoryTime | null {
  if (!s?.trim()) return null
  const f = s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  const d = /(?:day|jour|j)\s*(\d+)/.exec(f)
  const h = /(\d{1,2})\s*(?::|h)\s*(\d{2})?/.exec(f)
  let minutes: number | null = h ? Number(h[1]) * 60 + Number(h[2] ?? 0) : null
  if (minutes === null) for (const [k, v] of Object.entries(PART_OF_DAY)) if (f.includes(k)) { minutes = v; break }
  const day = d ? Number(d[1]) : null
  return day === null && minutes === null ? null : { day, minutes }
}

export interface TimeFlag { sceneId: string; message: string }

/** Time that runs backwards, and a POV character in two places at once. */
export function timeFlags(book: Book, fr: boolean): TimeFlag[] {
  const out: TimeFlag[] = []
  let prev: { s: Scene; t: StoryTime } | null = null
  for (const s of book.chapters.flatMap(c => c.scenes)) {
    const t = parseStoryTime(s.time)
    if (!t) continue
    const flashback = /flashback|souvenir|analepse|memory/i.test(`${s.title} ${s.note ?? ''}`)
    if (prev && !flashback) {
      const p = prev.t
      const sameDay = t.day !== null && t.day === p.day
      if (t.day !== null && p.day !== null && t.day < p.day) {
        out.push({ sceneId: s.id, message: fr ? `Revient au jour ${t.day} après le jour ${p.day} (« ${prev.s.title} »).` : `Goes back to day ${t.day} after day ${p.day} ("${prev.s.title}").` })
      } else if (sameDay && t.minutes !== null && p.minutes !== null && t.minutes < p.minutes) {
        out.push({ sceneId: s.id, message: fr ? `Plus tôt le même jour que « ${prev.s.title} ».` : `Earlier the same day than "${prev.s.title}".` })
      } else if (sameDay && t.minutes !== null && p.minutes !== null && t.minutes - p.minutes <= 20 && s.place && prev.s.place && s.place !== prev.s.place && s.pov && s.pov === prev.s.pov) {
        out.push({ sceneId: s.id, message: fr ? `Le même personnage change de lieu en ${t.minutes - p.minutes} minutes.` : `The same character changes place in ${t.minutes - p.minutes} minutes.` })
      }
    }
    prev = { s, t }
  }
  return out
}
