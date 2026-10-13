// Text analysis in French and English, all local (zero tokens): sentences,
// adverbs, passive voice, dialogue, filter and filler words, repetition.
// Used by the rule checker (proposals), the style profile and the Review reports.
// Every finding carries its place in the text so it can be highlighted.
import type { Lang } from './types'
import { foldText } from './text'

export interface Span { from: number; to: number }
export interface Finding extends Span { note?: string }

const WORD = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu

export function words(text: string): (Span & { w: string })[] {
  const out: (Span & { w: string })[] = []
  for (const m of text.matchAll(WORD)) out.push({ from: m.index!, to: m.index! + m[0].length, w: m[0] })
  return out
}

/** Sentences with their place; a line break always ends one. */
export function sentences(text: string): (Span & { s: string; words: number })[] {
  const out: (Span & { s: string; words: number })[] = []
  const re = /[^.!?…\n]+(?:[.!?…]+[»”"’)]*|$)/gm
  for (const m of text.matchAll(re)) {
    const raw = m[0]
    const lead = raw.length - raw.trimStart().length
    const s = raw.trim()
    if (!/\p{L}/u.test(s)) continue
    const from = m.index! + lead
    out.push({ from, to: from + s.length, s, words: (s.match(WORD) ?? []).length })
  }
  return out
}

export const paragraphs = (text: string): (Span & { p: string })[] => {
  const out: (Span & { p: string })[] = []
  let at = 0
  for (const line of text.split('\n')) {
    if (line.trim()) out.push({ from: at, to: at + line.length, p: line })
    at += line.length + 1
  }
  return out
}

/** A line of dialogue: opens with a dash, or a quoted passage. */
export function dialogue(text: string): Finding[] {
  const out: Finding[] = []
  for (const p of paragraphs(text)) {
    if (/^\s*[—–]/.test(p.p)) { out.push({ from: p.from, to: p.to }); continue }
    for (const m of p.p.matchAll(/«[^»]*»|“[^”]*”|"[^"]*"/g)) out.push({ from: p.from + m.index!, to: p.from + m.index! + m[0].length })
  }
  return out
}

// --- Adverbs ---------------------------------------------------------------

const FR_MENT_NOUNS = new Set(('moment comment element appartement gouvernement sentiment mouvement monument instrument vetement testament firmament document argument aliment ciment serment tourment segment regiment jument chatiment logement batiment evenement roulement departement raisonnement enseignement comportement fragment ornement parlement supplement complement temperament medicament paiement equipement changement commencement developpement traitement jugement ' +
  'accompagnement agrandissement amendement amusement arrangement avertissement bouleversement chargement classement craquement deplacement eclaircissement effondrement egarement emerveillement emplacement emportement encouragement engagement enlevement ensevelissement entrainement envoutement epuisement etonnement evanouissement froncement gemissement glissement grincement grondement habillement hurlement isolement jaillissement licenciement mecontentement pressentiment rassemblement recueillement reglement remerciement renseignement ressentiment retournement sifflement soulagement soulevement tremblement vieillissement agacement alignement aboiement ' +
  'clement dement vehement').split(/\s+/))
const EN_LY_NOT = new Set('only family early holy ugly lonely friendly silly reply apply supply belly jelly fly july italy ally rally bully lily daily weekly monthly yearly likely unlikely costly lovely lively deadly elderly orderly jolly folly melancholy curly surly burly hilly chilly woolly wily oily rely assembly anomaly butterfly dragonfly emily molly sally kelly billy willy holly dolly gully homily monopoly'.split(' '))

export function isAdverb(word: string, lang: Lang): boolean {
  // French elisions (l’, d’, qu’) belong to the next word, not to the adverb.
  const w = lang === 'fr' ? foldText(word).replace(/^[a-z]{1,3}'/, '') : foldText(word)
  if (lang === 'fr') return w.length > 6 && w.endsWith('ment') && !FR_MENT_NOUNS.has(w.replace(/s$/, ''))
  return w.length > 4 && w.endsWith('ly') && !EN_LY_NOT.has(w)
}

export const adverbs = (text: string, lang: Lang): Finding[] => words(text).filter(x => isAdverb(x.w, lang)).map(({ from, to }) => ({ from, to }))

// --- Passive voice ---------------------------------------------------------

const FR_ETRE = '(?:suis|es|est|sommes|êtes|sont|étais|était|étions|étiez|étaient|fus|fut|fûmes|furent|serai|sera|seront|serait|seraient|soit|soient|été|être)'
const FR_PASSIVE = new RegExp(`(?<![\\p{L}])${FR_ETRE}\\s+(?:(?:pas|plus|jamais|bien|très|déjà|toujours|vite|\\p{L}+ment)\\s+)?(\\p{L}{2,}(?:é|ée|és|ées|is|ise|ises|it|ite|its|ites|u|ue|us|ues|ert|erte|erts|ertes|int|inte|ints|aint|ainte))(?![\\p{L}])`, 'giu')
// Verbs of state after être that aren't passives: "il est né", "elle est allée"...
const FR_NOT_PASSIVE = /^(?:né|née|nés|nées|allé|allée|allés|allées|venu|venue|venus|venues|arrivé|arrivée|arrivés|arrivées|parti|partie|partis|parties|sorti|sortie|sortis|sorties|entré|entrée|entrés|entrées|resté|restée|restés|restées|tombé|tombée|tombés|tombées|monté|montée|montés|montées|descendu|descendue|descendus|descendues|mort|morte|morts|mortes|devenu|devenue|devenus|devenues|revenu|revenue|revenus|revenues|retourné|retournée|retournés|retournées|rentré|rentrée|rentrés|rentrées|passé|passée|passés|passées|assis|assise|assises|perdu|perdue|fatigué|fatiguée|habillé|habillée|occupé|occupée|prêt|prête|seul|seule|ému|émue|vêtu|vêtue|déçu|déçue|sûr|sûre|nu|nue|fini|finie|été|bu|vu|pu|su|lu|eu|dû|plus|tous|tout|toute|toutes)$/i
const EN_PASSIVE = /\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+(?:ed|en)|built|bought|brought|caught|done|felt|found|given|held|kept|known|left|lost|made|meant|met|paid|put|said|seen|sent|set|shot|shown|sold|spent|struck|taken|taught|told|thought|torn|thrown|understood|won|worn|written|hidden|beaten|bitten|broken|chosen|driven|eaten|fallen|forgotten|frozen|gotten|ridden|risen|shaken|stolen|sworn|woken)\b/gi
const EN_NOT_PASSIVE = /^(?:been|seen|open|often|even|garden|golden|wooden|sudden|tired|scared|worried|excited|interested|bored|married|used|supposed|born|gone|done|dressed|engaged|pleased|surprised|ashamed|amazed|annoyed|confused|convinced|determined|exhausted|frightened|terrified|delighted|disappointed)$/i

export function passives(text: string, lang: Lang): Finding[] {
  const out: Finding[] = []
  const re = lang === 'fr' ? FR_PASSIVE : EN_PASSIVE
  const not = lang === 'fr' ? FR_NOT_PASSIVE : EN_NOT_PASSIVE
  for (const m of text.matchAll(re)) {
    if (not.test(m[1])) continue
    out.push({ from: m.index!, to: m.index! + m[0].length })
  }
  return out
}

// --- Word lists by language --------------------------------------------------

export const STOPWORDS: Record<Lang, Set<string>> = {
  fr: new Set(foldText('le la les l un une des du de d au aux et ou mais donc or ni car que qu qui quoi dont où ce cet cette ces c ça cela ceci il elle ils elles on je j me m moi tu te t toi nous vous se s lui leur leurs son sa ses mon ma mes ton ta tes notre nos votre vos y en ne n pas plus a à as ai avait avais avaient est était étaient été être avoir fut sont suis sur sous dans par pour avec sans vers chez entre comme si tout tous toute toutes même aussi alors puis très bien peu encore déjà là ici quand dit fit fait faire rien elle-même lui-même cette leurs avoir').split(/\s+/)),
  en: new Set('the a an and or but so of to in on at by for with from into onto as is was were be been being am are have has had do did does not no it its he she they them his her their him i me my we us our you your that this these those there here then than which who whom what when where why how if all any some one just would could should will can may might shall must up down out over again very too said'.split(/\s+/)),
}

/** Words that put a filter between the reader and the scene (she saw, he felt). */
export const FILTER_WORDS: Record<Lang, string[]> = {
  fr: ['vit', 'voyait', 'regarda', 'entendit', 'entendait', 'sentit', 'sentait', 'remarqua', 'remarquait', 'aperçut', 'percevait', 'sembla', 'semblait', 'parut', 'paraissait', 'pensa', 'pensait', 'savait', 'sut', 'comprit', 'comprenait', 'réalisa', 'se demanda', 'se rendit compte', 'décida', 'observa', 'constata'],
  en: ['saw', 'see', 'seen', 'heard', 'hear', 'felt', 'feel', 'noticed', 'notice', 'watched', 'looked', 'seemed', 'appeared', 'realized', 'realised', 'wondered', 'thought', 'knew', 'decided', 'smelled', 'tasted', 'observed'],
}

/** Telling words: an emotion named instead of shown. */
export const TELLING_WORDS: Record<Lang, string[]> = {
  fr: ['triste', 'heureux', 'heureuse', 'en colère', 'furieux', 'furieuse', 'effrayé', 'effrayée', 'nerveux', 'nerveuse', 'surpris', 'surprise', 'déçu', 'déçue', 'jaloux', 'jalouse', 'honteux', 'honteuse', 'anxieux', 'anxieuse', 'soulagé', 'soulagée', 'tristesse', 'colère', 'joie', 'angoisse', 'désespoir', 'ressentit', 'éprouva', 'éprouvait'],
  en: ['sad', 'happy', 'angry', 'furious', 'afraid', 'scared', 'nervous', 'surprised', 'disappointed', 'jealous', 'ashamed', 'anxious', 'relieved', 'sadness', 'anger', 'fear', 'joy', 'despair', 'excited', 'frustrated', 'upset', 'lonely'],
}

/** Filler and weak words that rarely earn their place. */
export const FILLER_WORDS: Record<Lang, string[]> = {
  fr: ['juste', 'vraiment', 'très', 'un peu', 'assez', 'plutôt', 'presque', 'simplement', 'en fait', 'sorte de', 'genre', 'quelque chose', 'chose', 'commença à', 'se mit à', 'soudain', 'soudainement', 'tout à coup', 'complètement', 'totalement', 'absolument', 'extrêmement'],
  en: ['just', 'really', 'very', 'quite', 'rather', 'somewhat', 'a bit', 'a little', 'sort of', 'kind of', 'actually', 'basically', 'thing', 'things', 'stuff', 'began to', 'started to', 'suddenly', 'totally', 'completely', 'absolutely', 'extremely'],
}

/** Clichés to avoid (a short list; add yours as a word list in the bible). */
export const CLICHES: Record<Lang, string[]> = {
  fr: ['le cœur battant', 'le souffle coupé', 'un silence de mort', 'glacé d’effroi', 'son sang se glaça', 'froid dans le dos', 'comme une bête traquée', 'les larmes aux yeux', 'en un clin d’œil', 'au fond de lui', 'au fond d’elle', 'un frisson parcourut', 'la boule au ventre', 'le temps s’arrêta', 'sourire en coin', 'ses yeux s’écarquillèrent', 'il déglutit', 'elle déglutit', 'retint son souffle', 'une éternité', 'noir d’encre', 'blanc comme un linge', 'figé sur place', 'cloué sur place'],
  en: ['heart pounding', 'heart raced', 'blood ran cold', 'shiver down', 'shivers down', 'in the blink of an eye', 'time stood still', 'let out a breath', 'released a breath', 'eyes widened', 'jaw dropped', 'swallowed hard', 'dead silence', 'deafening silence', 'pitch black', 'white as a sheet', 'rooted to the spot', 'frozen in place', 'a wave of', 'a chill ran', 'tears streamed', 'smirked'],
}

/** Dialogue tags: the plain ones, and the showy ones AutoCrit flags. */
export const PLAIN_TAGS: Record<Lang, string[]> = {
  fr: ['dit', 'disait', 'demanda', 'demandait', 'répondit', 'répondait', 'fit'],
  en: ['said', 'says', 'asked', 'asks', 'replied', 'answered'],
}
export const FANCY_TAGS: Record<Lang, string[]> = {
  fr: ['s’exclama', 'murmura', 'chuchota', 'souffla', 'lança', 'rétorqua', 'grogna', 'gronda', 'siffla', 'hurla', 'cria', 'gémit', 'sanglota', 'ricana', 'balbutia', 'bredouilla', 'marmonna', 'grommela', 'ajouta', 'reprit', 'poursuivit', 'insista', 'répliqua', 'objecta', 'admit', 'avoua', 'concéda', 'protesta', 'supplia', 'ordonna', 'conclut'],
  en: ['exclaimed', 'whispered', 'murmured', 'muttered', 'snapped', 'growled', 'hissed', 'shouted', 'yelled', 'cried', 'sobbed', 'laughed', 'chuckled', 'sneered', 'stammered', 'mumbled', 'grumbled', 'added', 'continued', 'insisted', 'retorted', 'objected', 'admitted', 'conceded', 'protested', 'pleaded', 'begged', 'ordered', 'demanded', 'breathed', 'sighed', 'groaned', 'barked', 'spat'],
}

/** Sentence openers that start with a conjunction. */
export const CONJUNCTIONS: Record<Lang, string[]> = {
  fr: ['et', 'mais', 'ou', 'donc', 'or', 'car', 'puis', 'alors'],
  en: ['and', 'but', 'or', 'so', 'yet', 'then'],
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every place one of the phrases appears, accent- and case-insensitive. */
export function phrases(text: string, list: string[]): Finding[] {
  const clean = list.map(p => p.trim()).filter(Boolean)
  if (!clean.length) return []
  const folded = foldText(text)
  // Folding French and English letters keeps lengths, so positions line up; skip if not.
  if (folded.length !== text.length) return []
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${clean.map(p => escape(foldText(p))).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
  const out: Finding[] = []
  for (const m of folded.matchAll(re)) out.push({ from: m.index!, to: m.index! + m[0].length, note: text.slice(m.index!, m.index! + m[0].length) })
  return out
}

/** The same meaningful word again within `window` words (echoes). */
export function echoes(text: string, lang: Lang, window = 40): Finding[] {
  const ws = words(text)
  const out: Finding[] = []
  const last = new Map<string, number>()
  ws.forEach((x, i) => {
    const w = foldText(x.w)
    if (w.length < 4 || STOPWORDS[lang].has(w) || /^\d+$/.test(w)) return
    const stem = w.slice(0, Math.max(4, w.length - 2)) // "regard", "regarda", "regards" echo each other
    const prev = last.get(stem)
    if (prev !== undefined && i - prev <= window) out.push({ from: x.from, to: x.to, note: ws[prev].w })
    last.set(stem, i)
  })
  return out
}

/** Phrases of 3 to 5 words used more than once. */
export function repeatedPhrases(text: string, lang: Lang): Finding[] {
  const ws = words(text)
  const out: Finding[] = []
  const seen = new Map<string, number>()
  for (let n = 5; n >= 3; n--) {
    for (let i = 0; i + n <= ws.length; i++) {
      const gram = ws.slice(i, i + n).map(x => foldText(x.w))
      if (gram.filter(w => !STOPWORDS[lang].has(w)).length < 2) continue
      const key = gram.join(' ')
      if (!seen.has(key)) { seen.set(key, i); continue }
      const from = ws[i].from, to = ws[i + n - 1].to
      if (!out.some(f => f.from <= from && f.to >= to)) out.push({ from, to, note: key })
    }
  }
  return out
}

/** Sentences that open with the same word as the one before. */
export function repeatedStarts(text: string): Finding[] {
  const out: Finding[] = []
  let prev = ''
  for (const s of sentences(text)) {
    const first = foldText((s.s.replace(/^[—–«“"\s]+/, '').match(WORD) ?? [''])[0])
    if (first && first === prev) out.push({ from: s.from, to: s.from + Math.min(s.s.length, 30), note: first })
    prev = first
  }
  return out
}

/** Most used meaningful words, with counts. */
export function topWords(text: string, lang: Lang, n = 12): [string, number][] {
  const counts = new Map<string, number>()
  for (const x of words(text)) {
    const w = foldText(x.w)
    if (w.length < 4 || STOPWORDS[lang].has(w)) continue
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n)
}

/** Flesch reading ease (Kandel & Moles for French). Higher is easier; 60–80 reads as plain prose. */
export function readability(text: string, lang: Lang): number {
  const ws = words(text)
  const ss = sentences(text).length || 1
  if (!ws.length) return 0
  const syllables = ws.reduce((sum, x) => sum + Math.max(1, (foldText(x.w).match(/[aeiouy]+/g) ?? []).length - (/[^l]e$/.test(x.w) ? 1 : 0)), 0)
  const wps = ws.length / ss
  const spw = syllables / ws.length
  return lang === 'fr' ? 207 - 1.015 * wps - 73.6 * spw : 206.835 - 1.015 * wps - 84.6 * spw
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))) }

export interface Profile {
  words: number
  sentences: number
  avgSentence: number
  sentenceSpread: number
  dialogueShare: number
  adverbsPer1000: number
  passivePct: number
  filterPer1000: number
  readability: number
  top: [string, number][]
}

/** The measurable side of a writer's voice. */
export function profile(text: string, lang: Lang): Profile {
  const ws = words(text).length
  const ss = sentences(text)
  const dlg = dialogue(text).reduce((sum, d) => sum + d.to - d.from, 0)
  const chars = text.replace(/\n/g, '').length
  return {
    words: ws,
    sentences: ss.length,
    avgSentence: mean(ss.map(s => s.words)),
    sentenceSpread: sd(ss.map(s => s.words)),
    dialogueShare: chars ? Math.min(1, dlg / chars) : 0,
    adverbsPer1000: ws ? (adverbs(text, lang).length / ws) * 1000 : 0,
    passivePct: ss.length ? (passives(text, lang).length / ss.length) * 100 : 0,
    filterPer1000: ws ? (phrases(text, FILTER_WORDS[lang]).length / ws) * 1000 : 0,
    readability: readability(text, lang),
    top: topWords(text, lang),
  }
}

/** What kind of passage a text is, to pick matching excerpts of the author's prose. */
export function passageKind(text: string, lang: Lang): 'dialogue' | 'action' | 'description' | 'introspection' {
  const p = profile(text, lang)
  if (p.dialogueShare > 0.35) return 'dialogue'
  if (p.avgSentence && p.avgSentence < 11) return 'action'
  if (phrases(text, FILTER_WORDS[lang]).length + phrases(text, TELLING_WORDS[lang]).length > p.words / 60) return 'introspection'
  return 'description'
}
