// Review: which report is highlighted in the text, the AI checks run on
// demand (voice, continuity, beta readers, line edit as tracked changes),
// and reading aloud with a Windows voice. The local reports are in lib/review.ts.
import { create } from 'zustand'
import type { EditorView } from '@codemirror/view'
import { findScene, useStore } from './store'
import { buildMatcher, findMentions } from './lib/context'
import { estimateTokens, newId } from './lib/text'
import { ask, parseJSON } from './ai'
import { aiFull } from './lib/blocks'
import { changesField, setChanges } from './editor/marks'
import { systemPrompt } from './lib/context'
import { placeFixes, type FixEdit } from './lib/fixes'
import { makeSnap, saveSnap } from './lib/snapshots'
import { t } from './i18n'

export interface AIFinding { quote: string; note: string; who?: string }

interface ReviewState {
  /** The report highlighted in the text: a report id, "word:<w>" for an overused word, or "ai". */
  report: string | null
  ai: AIFinding[]
  aiTitle: string
  busy: string | null
  speaking: boolean
}

export const useReview = create<ReviewState>(() => ({ report: null, ai: [], aiTitle: '', busy: null, speaking: false }))

const fr = () => useStore.getState().book?.meta.language === 'fr'

function sceneOf(id: string) {
  const f = findScene(useStore.getState().book, id)
  if (!f) throw new Error(t('Pick a scene first.'))
  return f
}

async function run(kind: string, title: string, go: () => Promise<AIFinding[]>) {
  useReview.setState({ busy: kind })
  try {
    const ai = await go()
    useReview.setState({ ai, aiTitle: title, report: 'ai' })
    if (!ai.length) useStore.getState().notify('ok', t('Nothing to flag.'))
  } catch (e) { useStore.getState().notify('error', (e as Error).message) }
  useReview.setState({ busy: null })
}

const JSON_LIST = '[{"quote": "exact words from the text", "note": "...", "who": "..."}]'

/** Characters in the text who have a voice card. */
function voiced(text: string) {
  const book = useStore.getState().book!
  const chars = book.entries.filter(e => e.type === 'character' && e.voice && Object.values(e.voice).some(v => v.trim()) && e.include !== 'secret')
  const here = new Set(findMentions(text, buildMatcher(chars)).map(m => m.slug))
  return chars.filter(c => here.has(c.slug))
}

export const voiceCheckCost = (sceneId: string) => {
  const { scene } = sceneOf(sceneId)
  return estimateTokens(scene.text) + voiced(scene.text).length * 120 + 400
}

/** Lines of dialogue that sound like someone other than their speaker. */
export function voiceCheck(sceneId: string) {
  return run('voice', t('Voice check'), async () => {
    const { scene } = sceneOf(sceneId)
    const cards = voiced(scene.text).map(c => `<character name="${c.name}">\n${Object.entries(c.voice!).filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v}`).join('\n')}\n</character>`).join('\n')
    if (!cards) throw new Error(t('No character with a voice card speaks in this scene. Fill the Voice section of your characters in the bible.'))
    const reply = await ask({ json: 'list',
      role: 'edit',
      system: fr() ? 'Tu es un éditeur attentif aux voix des personnages. Réponds uniquement en JSON valide, en français.' : 'You are an editor with an ear for character voices. Reply with valid JSON only.',
      message: `<voice_cards>\n${cards}\n</voice_cards>\n<scene>\n${scene.text}\n</scene>\n\n${fr() ? 'Relève les répliques qui ne sonnent pas comme leur personnage (registre, tics, ce qu’il ne dirait jamais). Cite les mots exacts. "who" = le personnage.' : 'List lines of dialogue that don’t sound like their speaker (register, tics, what they’d never say). Quote the exact words. "who" = the character.'}\nJSON: ${JSON_LIST}`,
    })
    return parseJSON<AIFinding[]>(reply) ?? []
  })
}

export const continuityCost = (sceneId: string) => estimateTokens(sceneOf(sceneId).scene.text) * 2 + 600

/** What in the scene contradicts the bible (with the facts true at this chapter). */
export function continuityCheck(sceneId: string) {
  return run('continuity', t('Continuity check'), async () => {
    const book = useStore.getState().book!
    const { scene, number } = sceneOf(sceneId)
    const named = book.entries.filter(e => !['style', 'wordlist', 'excerpt'].includes(e.type) && e.include !== 'secret')
    const here = new Set(findMentions(scene.text, buildMatcher(named)).map(m => m.slug))
    const bible = named.filter(e => here.has(e.slug) || e.include === 'always').map(e => `<entry name="${e.name}">\n${[e.short, aiFull(e), e.facts.map(f => `- ${f.text}`).join('\n')].filter(s => s.trim()).join('\n')}\n</entry>`).join('\n')
    const reply = await ask({ json: 'list',
      role: 'edit',
      system: fr() ? 'Tu vérifies la continuité d’un roman. Réponds uniquement en JSON valide, en français.' : 'You check a novel’s continuity. Reply with valid JSON only.',
      message: `<bible chapter="${number}">\n${bible}\n</bible>\n<scene>\n${scene.text}\n</scene>\n\n${fr() ? 'Relève ce qui, dans la scène, contredit la bible (noms, lieux, objets, règles, faits, âges). Cite les mots exacts de la scène.' : 'List what in the scene contradicts the bible (names, places, objects, rules, facts, ages). Quote the exact words of the scene.'}\nJSON: ${JSON_LIST}`,
    })
    return parseJSON<AIFinding[]>(reply) ?? []
  })
}

export const PERSONAS: { id: string; label: string; en: string; fr: string }[] = [
  { id: 'fan', label: 'Genre fan', en: 'an avid reader of this genre who has read everything and is quick to get bored', fr: 'un lecteur passionné du genre, qui a tout lu et s’ennuie vite' },
  { id: 'editor', label: 'Picky editor', en: 'a demanding publishing editor who flags every weakness of structure, rhythm and style', fr: 'un éditeur exigeant qui relève chaque faiblesse de structure, de rythme et de style' },
  { id: 'casual', label: 'Casual reader', en: 'a casual reader who reads on the train and says plainly when they are lost or bored', fr: 'un lecteur occasionnel qui lit dans le train et dit franchement quand il est perdu ou s’ennuie' },
  { id: 'sensitivity', label: 'Sensitivity reader', en: 'a sensitivity reader who points out clumsy or hurtful portrayals', fr: 'un relecteur sensible qui signale les représentations maladroites ou blessantes' },
]

export const betaCost = (chapterText: string) => estimateTokens(chapterText) + 800

/** A beta reader comments on a chapter: what works, what doesn't, with quotes. */
export function betaRead(chapterId: string, persona: string, custom = '') {
  return run('beta', t('Beta reader'), async () => {
    const book = useStore.getState().book!
    const ch = book.chapters.find(c => c.id === chapterId)!
    const p = PERSONAS.find(x => x.id === persona)
    const who = custom.trim() || (p ? p[fr() ? 'fr' : 'en'] : '')
    const text = ch.scenes.map(s => s.text).join('\n\n* * *\n\n')
    const reply = await ask({ json: 'list',
      role: 'edit',
      system: fr() ? `Tu es ${who}. Tu lis un chapitre d’un roman en cours et tu le commentes franchement pour l’auteur, en français. Réponds uniquement en JSON valide.` : `You are ${who}. You read a chapter of a novel in progress and comment honestly for the author. Reply with valid JSON only.`,
      message: `<chapter>\n${text}\n</chapter>\n\n${fr() ? 'Donne 5 à 10 réactions de lecteur, liées à des passages précis (cite les mots exacts) : ce qui accroche, ce qui ennuie, ce qui est confus, ce que tu as aimé. "who" = ton rôle.' : 'Give 5 to 10 reader reactions tied to precise passages (quote the exact words): what grips, what bores, what confuses, what you loved. "who" = your role.'}\nJSON: ${JSON_LIST}`,
    })
    return parseJSON<AIFinding[]>(reply) ?? []
  })
}

export const lineEditCost = (sceneId: string) => estimateTokens(sceneOf(sceneId).scene.text) * 2 + 500

/**
 * A line edit of the scene, shown as tracked changes in the text: accept or reject each.
 * The same engine as Edit this chapter: your voice (style guide, samples) as Claude
 * reads it when writing, tolerant matching, a snapshot first, and changes already
 * waiting in the scene kept.
 */
export async function lineEdit(sceneId: string, view: EditorView | null) {
  if (!view) return useStore.getState().notify('warn', t('Click into the scene first.'))
  useReview.setState({ busy: 'edit' })
  try {
    const book = useStore.getState().book!
    const { scene, number, chapter } = sceneOf(sceneId)
    const F = fr()
    const reply = await ask({ json: 'list',
      role: 'edit',
      system: systemPrompt(book, 'rewrite', number),
      message: `<scene>\n${scene.text}\n</scene>\n\n<task>\n${F
        ? 'Fais la correction ligne à ligne de cette scène, dans la voix de l’auteur : au plus 25 corrections ponctuelles (fautes, lourdeurs, répétitions, adverbes inutiles, clichés, phrases qu’il faut relire pour comprendre). Ne réécris pas ce qui marche. "find" = les mots exacts du texte (assez pour être uniques), "replace" = le remplacement, "why" = la raison en quelques mots.'
        : 'Line edit this scene in the author’s voice: at most 25 local edits (errors, clunky phrasing, repetitions, needless adverbs, clichés, sentences that need a second reading). Leave what works alone. "find" = the exact words of the text (enough to be unique), "replace" = the replacement, "why" = the reason in a few words.'}\n</task>\n\nJSON: [{"find": "…", "replace": "…", "why": "…"}]`,
    })
    const edits = parseJSON<FixEdit[]>(reply)
    if (!Array.isArray(edits)) throw new Error(t('Claude’s reply could not be read. Try again.'))
    await saveSnap(book.root, makeSnap(book, t('Before the line edit of “{title}”', { title: scene.title || chapter.title || t('Chapter') })))
    const doc = view.state.doc.toString()
    const { fixes, missed } = placeFixes(doc, edits, book.meta.language)
    const have = view.state.field(changesField)
    const fresh = fixes.filter(c => !have.some(h => c.from <= h.to && c.to >= h.from)).map(c => ({ id: newId(), ...c }))
    view.dispatch({ effects: setChanges.of([...have, ...fresh]) })
    useStore.getState().notify(missed ? 'warn' : 'ok', [
      t('{n} suggested edits in the text: ✓ to accept, ✕ to reject.', { n: fresh.length }),
      missed ? t('Not placed, the words were not found in the text: {k}.', { k: missed }) : '',
    ].filter(Boolean).join(' '))
  } catch (e) { useStore.getState().notify('error', (e as Error).message) }
  useReview.setState({ busy: null })
}

// --- Read aloud -------------------------------------------------------------------

/** Windows voices for a language (the system ones, free and offline). */
export function voicesFor(lang: string): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  return speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith(lang))
}

/** The voices Windows has: they load a moment after the app starts, so wait for them. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve([])
  if (speechSynthesis.getVoices().length) return Promise.resolve(speechSynthesis.getVoices())
  return new Promise(resolve => {
    const done = () => resolve(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1500)
  })
}

/** Reads the text aloud, paragraph by paragraph, with a voice in the book's language. */
export async function readAloud(text: string, lang: string) {
  if (typeof speechSynthesis === 'undefined') return useStore.getState().notify('error', t('No voice available on this computer.'))
  speechSynthesis.cancel()
  const mine = (await loadVoices()).filter(v => v.lang.toLowerCase().startsWith(lang))
  // Never read English with a French voice (or the other way round): say what is missing.
  if (!mine.length) return useStore.getState().notify('warn', t(lang === 'fr' ? 'No French voice is installed on this computer. Windows Settings → Time & language → Speech → Add voices.' : 'No English voice is installed on this computer. Windows Settings → Time & language → Speech → Add voices.'))
  const name = useStore.getState().prefs.readVoice
  const voice = mine.find(v => v.name === name) ?? mine[0]
  const paras = text.split('\n').map(p => p.trim()).filter(Boolean)
  if (!paras.length) return
  useReview.setState({ speaking: true })
  paras.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p.replace(/^[—–]\s*/, '').replace(/\*+/g, ''))
    u.lang = lang === 'fr' ? 'fr-FR' : 'en-US'
    if (voice) u.voice = voice
    u.rate = 0.95
    if (i === paras.length - 1) u.onend = () => useReview.setState({ speaking: false })
    speechSynthesis.speak(u)
  })
}

export function stopReading() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  useReview.setState({ speaking: false })
}
