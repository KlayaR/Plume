// Edit this chapter: one pass that checks a whole chapter (the free local
// reports, LanguageTool, and one reading by Claude: continuity, voice, the plan,
// prose and pacing), a list you untick, then Claude's fixes for what you kept,
// as tracked changes in the text to accept or reject one by one.
import { create } from 'zustand'
import { findScene, useStore } from './store'
import { ask, effective, parseJSON } from './ai'
import { buildMatcher, findMentions, renderEntry, systemPrompt } from './lib/context'
import { chapterText } from './lib/outline'
import { checkRules, type Check } from './lib/voice'
import { reviewChecks } from './lib/review'
import { applyFixes, fixGuard, fixRequest, placeFixes, type FixEdit } from './lib/fixes'
import { isLocked } from './lib/serial'
import { newId } from './lib/text'
import { makeSnap, saveSnap } from './lib/snapshots'
import { assistantChoice, useAI } from './editor/actions'
import { checkWithLT } from './editor/Editor'
import type { Change } from './editor/marks'
import { canRun } from './llm'
import { costText } from './cost'
import { t, translate } from './i18n'
import { ask as askDialog } from '@tauri-apps/plugin-dialog'
import type { Book, Chapter } from './lib/types'

export type Depth = 'polish' | 'deep'
export type Severity = 'error' | 'craft' | 'polish'

export interface Finding {
  id: string
  /** The scene it is in (its id), found from Claude's scene number or from the quote. */
  sceneId: string
  quote: string
  kind: string
  severity: Severity
  problem: string
  fix: string
  /** LanguageTool's own correction: applied without asking Claude. */
  ready?: string
  on: boolean
}

interface EditState {
  chapterId: string | null
  depth: Depth
  stage: 'start' | 'checking' | 'list' | 'fixing' | 'done'
  findings: Finding[]
  /** Fixes waiting for their scene's editor, by scene id (applied when the scene is on screen). */
  pending: Record<string, Change[]>
  placed: number
}

export const useEdit = create<EditState>(() => ({ chapterId: null, depth: 'deep', stage: 'start', findings: [], pending: {}, placed: 0 }))

export const openEdit = (chapterId: string) => useEdit.setState({ chapterId, stage: 'start', findings: [], placed: 0 })
export const closeEdit = () => useEdit.setState({ chapterId: null, stage: 'start', findings: [] })

const SEVERITIES: Severity[] = ['error', 'craft', 'polish']
const fr = (book: Book) => book.meta.language === 'fr'
const scenesOf = (c: Chapter) => c.scenes.filter(s => s.text.trim())

/** The chapter as Claude reads it: numbered scenes, so findings and fixes say where they are. */
const chapterBody = (c: Chapter) => scenesOf(c).map((s, i) => `<scene n="${i + 1}" title="${s.title}">\n${s.text.trim()}\n</scene>`).join('\n')

/** The scene a finding is in: the one Claude named if the quote is there, else the first that holds the quote. */
function sceneFor(c: Chapter, n: unknown, quote: string): string | null {
  const list = scenesOf(c)
  const named = list[Number(n) - 1]
  if (named && (!quote || named.text.includes(quote))) return named.id
  return list.find(s => quote && s.text.includes(quote))?.id ?? named?.id ?? null
}

/** Rough cost of a check and its fixes, in tokens, to show before it runs. */
export const editCost = (c: Chapter, depth: Depth) => {
  const words = scenesOf(c).reduce((n, s) => n + s.text.split(/\s+/).length, 0)
  return Math.round(words * 1.4 * (depth === 'deep' ? 2.2 : 1.6)) + 1500
}

/** Checks the chapter: LanguageTool (free), then Claude reads it once, with what Plume measures as hints. */
export async function checkChapter(depth: Depth) {
  const st = useStore.getState()
  const book = st.book
  const c = book?.chapters.find(x => x.id === useEdit.getState().chapterId)
  if (!book || !c) return
  if (!scenesOf(c).length) return st.notify('warn', t('This chapter has no text yet.'))
  useEdit.setState({ depth, stage: 'checking', findings: [] })
  const F = fr(book)
  const n = book.chapters.indexOf(c) + 1
  const found: Finding[] = []
  try {
    // LanguageTool's spelling and grammar, with its own corrections.
    if (st.prefs.spell === 'languagetool') {
      for (const s of scenesOf(c)) {
        try {
          for (const m of await checkWithLT(s.text)) {
            if (m.kind === 'style' || !m.replacements.length) continue
            found.push({ id: newId(), sceneId: s.id, quote: s.text.slice(m.from, m.to), kind: m.kind === 'spell' ? t('Spelling') : t('Grammar'), severity: 'error', problem: m.message, fix: m.replacements[0] || t('(delete)'), ready: m.replacements[0], on: true })
          }
        } catch { /* LanguageTool unreachable: Claude still reads the chapter */ }
      }
    }
    // What Plume measures for free, given to Claude as hints, with the passages behind it.
    const all = scenesOf(c).map(s => s.text).join('\n\n')
    const measured = flagged(all, book).map(x => `- ${x.fix}`).join('\n')
    // Deep: the bible as true at this chapter (with voice cards and what the POV knows) and the chapter's plan.
    const named = book.entries.filter(e => !['style', 'wordlist', 'excerpt'].includes(e.type) && e.include !== 'secret')
    const here = new Set(findMentions(all, buildMatcher(named)).map(m => m.slug))
    const pov = scenesOf(c)[0]?.pov
    const bible = depth === 'deep'
      ? named.filter(e => here.has(e.slug) || e.include === 'always').map(e => renderEntry(e, 'full', n, book.meta.language, book.meta.series?.index ?? 1, e.slug === pov, book.meta.fields?.[e.type])).join('\n\n')
      : ''
    const plan = depth === 'deep' && c.scenes.some(s => s.note?.trim() || s.beats?.length) ? chapterText(book, c, n) : ''
    const what = depth === 'deep'
      ? (F ? `Lis ce chapitre comme un éditeur exigeant, au niveau des meilleurs romans du genre. Relève les vrais problèmes :
- continuité : ce qui contredit <bible> (faits vrais à ce chapitre, noms, règles de la magie, ce que le personnage du point de vue sait ou ignore) ;
- voix : des répliques qui ne sonnent pas comme leur personnage (fiches de voix) ;
- plan : ce que <plan> demande et que le chapitre ne fait pas (but, étapes, fin sur un tournant) ;
- rythme : passages qui traînent, tension qui retombe, scène sans enjeu ;
- dialogue : plat, explicatif, tout le monde parle pareil ;
- prose : dire au lieu de montrer, émotions nommées, verbes de perception inutiles, clichés, tics d’IA (contrastes « pas X mais Y », triades, comparaisons en série, « , et il… » à répétition, « comme on… »), répétitions, phrases lourdes ;
- langue : fautes, accords, ponctuation.`
        : `Read this chapter as a demanding editor, at the level of the genre's best novels. List the real problems:
- continuity: what contradicts <bible> (facts true at this chapter, names, magic rules, what the point-of-view character knows or doesn't);
- voice: lines that don't sound like their speaker (voice cards);
- plan: what <plan> asks for that the chapter doesn't do (goal, beats, ending on a turn);
- pacing: passages that drag, tension that drops, a scene with nothing at stake;
- dialogue: flat, expository, everyone sounding the same;
- prose: telling instead of showing, named emotions, needless filter verbs, clichés, AI tells ("not X but Y" contrasts, triads, strings of similes), repetitions, clunky sentences;
- language: errors, agreement, punctuation.`)
      : (F ? `Relis ce chapitre comme un correcteur littéraire : fautes, répétitions, lourdeurs, clichés, verbes de perception inutiles, émotions nommées, tics d’IA (contrastes « pas X mais Y », triades, comparaisons en série, « , et il… » à répétition, « comme on… »), ponctuation. Pas de remarques sur l’intrigue ni le rythme.`
        : `Read this chapter as a line editor: errors, repetitions, clunky phrasing, clichés, needless filter verbs, named emotions, AI tells ("not X but Y" contrasts, triads, strings of similes), punctuation. No remarks on plot or pacing.`)
    const reply = await ask({
      role: 'edit',
      system: F ? 'Tu es éditeur de romans. Tu relèves des problèmes précis, cités mot pour mot, sans réécrire le livre. Réponds uniquement en JSON valide, en français.' : 'You are a fiction editor. You flag precise problems, quoted word for word, without rewriting the book. Reply with valid JSON only.',
      message: [
        bible ? `<bible chapter="${n}">\n${bible}\n</bible>` : '',
        plan ? `<plan>\n${plan}\n</plan>` : '',
        `<chapter n="${n}">\n${chapterBody(c)}\n</chapter>`,
        measured ? `<measured>\n${F ? 'Mesuré par Plume, passages à l’appui. Relèves-en les pires, sans qu’ils prennent la place des problèmes de fond :' : 'Measured by Plume, with the passages behind it. List the worst of them, without letting them crowd out the deeper problems:'}\n${measured}\n</measured>` : '',
        `<task>\n${what}\n${F
          ? `Au plus ${depth === 'deep' ? 30 : 25} problèmes, les plus importants d’abord. Pour chacun : "scene" (son numéro), "quote" (les mots exacts du texte, assez pour être uniques, une phrase au plus), "kind" (un mot), "severity" ("error" : faute ou contradiction ; "craft" : ce qui affaiblit le livre ; "polish" : finition), "problem" (court) et "fix" (la correction concrète). S’il n’y a rien sur un point, n’invente rien.`
          : `At most ${depth === 'deep' ? 30 : 25} problems, most important first. For each: "scene" (its number), "quote" (the exact words of the text, enough to be unique, one sentence at most), "kind" (one word), "severity" ("error": a mistake or contradiction; "craft": what weakens the book; "polish": finish), "problem" (short) and "fix" (the concrete correction). If there is nothing on a point, don't invent anything.`}\n</task>`,
        'JSON: [{"scene": 1, "quote": "…", "kind": "…", "severity": "error|craft|polish", "problem": "…", "fix": "…"}]',
      ].filter(Boolean).join('\n\n'),
    })
    const list = parseJSON<Record<string, unknown>[]>(reply)
    if (!Array.isArray(list)) throw new Error(t('Claude’s reply could not be read. Try again.'))
    for (const x of list) {
      const quote = String(x.quote ?? '').trim()
      const sceneId = sceneFor(c, x.scene, quote)
      if (!sceneId || !String(x.problem ?? '').trim()) continue
      const severity = SEVERITIES.includes(x.severity as Severity) ? x.severity as Severity : 'craft'
      found.push({ id: newId(), sceneId, quote, kind: String(x.kind ?? ''), severity, problem: String(x.problem).trim(), fix: String(x.fix ?? '').trim(), on: true })
    }
    found.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity))
    useEdit.setState({ stage: 'list', findings: found })
  } catch (e) {
    useEdit.setState({ stage: found.length ? 'list' : 'start', findings: found })
    st.notify('error', (e as Error).message)
  }
}

export const toggleFinding = (id: string) => useEdit.setState(s => ({ findings: s.findings.map(f => (f.id === id ? { ...f, on: !f.on } : f)) }))
export const toggleAll = (on: boolean, severity?: Severity) => useEdit.setState(s => ({ findings: s.findings.map(f => (!severity || f.severity === severity ? { ...f, on } : f)) }))

/** Where a fix's words are in a scene, not overlapping a change already placed; -1 if nowhere. */
export function locate(text: string, find: string, taken: { from: number; to: number }[]): number {
  if (!find) return -1
  for (let at = text.indexOf(find); at >= 0; at = text.indexOf(find, at + 1)) {
    if (!taken.some(c => at < c.to && at + find.length > c.from)) return at
  }
  return -1
}

/**
 * Claude fixes the ticked findings, as precise edits (small ones word for word,
 * a bigger one as a rewritten passage), placed in the text as tracked changes.
 * LanguageTool's corrections need no request. A snapshot is taken first.
 */
export async function fixChapter() {
  const st = useStore.getState()
  const book = st.book
  const { chapterId, findings } = useEdit.getState()
  const c = book?.chapters.find(x => x.id === chapterId)
  const chosen = findings.filter(f => f.on)
  if (!book || !c || !chosen.length) return
  const F = fr(book)
  const n = book.chapters.indexOf(c) + 1
  useEdit.setState({ stage: 'fixing' })
  const byScene: Record<string, Change[]> = {}
  const add = (sceneId: string, find: string, insert: string, why: string) => {
    const s = findScene(useStore.getState().book, sceneId)?.scene
    if (!s || !find || find === insert) return
    const list = byScene[sceneId] ??= []
    const at = locate(s.text, find, list)
    if (at >= 0) list.push({ id: newId(), from: at, to: at + find.length, insert, why })
  }
  try {
    await saveSnap(book.root, makeSnap(book, t('Before editing “{title}”', { title: c.title || t('Chapter') })))
    for (const f of chosen.filter(x => x.ready !== undefined)) add(f.sceneId, f.quote, f.ready!, `${f.kind}: ${f.problem}`)
    const forClaude = chosen.filter(x => x.ready === undefined)
    if (forClaude.length) {
      const scenes = scenesOf(c)
      const listed = forClaude.map((f, i) => `${i + 1}. [${F ? 'scène' : 'scene'} ${scenes.findIndex(s => s.id === f.sceneId) + 1}] “${f.quote}”: ${f.problem} → ${f.fix}`).join('\n')
      const choice = assistantChoice('rewrite')
      const e = effective(choice.model, choice.effort)
      const reply = await ask({
        model: e.model, effort: e.effort, orModel: choice.orModel,
        // The author's voice, style guide and prose samples, as when Claude writes (and from the cache).
        system: systemPrompt(book, 'rewrite', n),
        message: [
          `<chapter n="${n}">\n${chapterBody(c)}\n</chapter>`,
          `<to_fix>\n${listed}\n</to_fix>`,
          `<task>\n${F
            ? `Corrige chacun des problèmes de <to_fix>, et rien d’autre, dans la voix de l’auteur. Une correction = un remplacement : "find" = les mots exacts du chapitre à remplacer (le plus court passage qui suffit, unique dans sa scène), "replace" = le nouveau texte. Une petite faute se corrige en quelques mots ; un passage qui traîne, une scène sans tension ou un but manqué peut demander de réécrire un ou plusieurs paragraphes entiers ("find" = ces paragraphes). Garde à peu près la longueur, les noms, les faits et tout ce qui marche. "n" = le numéro du problème, "scene" = le numéro de la scène.`
            : `Fix each problem in <to_fix>, and nothing else, in the author's voice. One fix = one replacement: "find" = the exact words of the chapter to replace (the shortest passage that will do, unique in its scene), "replace" = the new text. A small error takes a few words; a passage that drags, a scene with no tension or a missed goal may need one or more whole paragraphs rewritten ("find" = those paragraphs). Keep about the same length, the names, the facts and whatever works. "n" = the problem's number, "scene" = the scene's number.`}\n</task>`,
          'JSON: [{"n": 1, "scene": 1, "find": "…", "replace": "…"}]',
        ].join('\n\n'),
      })
      const edits = parseJSON<Record<string, unknown>[]>(reply)
      if (!Array.isArray(edits)) throw new Error(t('Claude’s reply could not be read. Try again.'))
      for (const x of edits) {
        const f = forClaude[Number(x.n) - 1]
        const find = String(x.find ?? '')
        const sceneId = sceneFor(c, x.scene, find) ?? f?.sceneId
        if (sceneId) add(sceneId, find, String(x.replace ?? ''), f ? `${f.kind}: ${f.problem}` : '')
      }
    }
    const placed = Object.values(byScene).reduce((k, l) => k + l.length, 0)
    useEdit.setState(s => ({ stage: 'done', placed, pending: { ...s.pending, ...byScene } }))
    // The chapter on screen, so every scene's changes show.
    const first = Object.keys(byScene)[0]
    if (first) { st.setView('manuscript'); st.setPrefs({ mode: 'review' }); st.selectScene(first) }
  } catch (e) {
    useEdit.setState({ stage: 'list' })
    st.notify('error', (e as Error).message)
  }
}

/** What a text fails: your rules, then every report well over its target, explained in the book's language. */
export const flagged = (text: string, book: Book): Check[] => [
  ...checkRules(text, book),
  ...reviewChecks(text, book, { every: true, say: s => translate(book.meta.language, s) }),
].filter(c => !c.ok)

/**
 * Fixes what the scorecard flags in scenes already written, as tracked changes.
 * Claude sends only its replacements, so the rest of the scene stays as it is; a
 * snapshot is taken first, a scene whose fixes amount to a rewrite is left alone,
 * and the summary says what would still be flagged with every fix accepted.
 */
export async function fixFlagged(sceneIds: string[]) {
  const st = useStore.getState()
  const book = st.book
  if (!book || useAI.getState().running) return
  if (!canRun()) return st.notify('error', t('The claude command line was not found. Set its path in Settings.'))
  const lang = book.meta.language
  const written = sceneIds.map(id => findScene(book, id)).filter(f => !!f && !!f.scene.text.trim())
  const open = written.filter(f => !isLocked(f!.chapter, st.unlocked))
  if (written.length && !open.length) return st.notify('warn', t('This chapter is published: press Edit anyway above it to change it.'))
  const todo = open.map(f => ({ id: f!.scene.id, words: f!.scene.text.split(/\s+/).length, failed: flagged(f!.scene.text, book) })).filter(x => x.failed.length)
  if (!todo.length) return st.notify('ok', t('Nothing flagged here: your rules and the reports are within their targets.'))
  const points = [...new Set(todo.flatMap(x => x.failed.map(c => t(c.label))))].join(', ')
  const tokens = todo.reduce((k, x) => k + Math.round(x.words * 1.8) + 1500, 0)
  if (!(await askDialog(t('Claude will fix {n} scene(s): {points}. {cost}. A snapshot is taken first, and every fix shows in the text as a tracked change to accept or reject.', { n: todo.length, points, cost: costText(tokens) }), { title: t('Fix what’s flagged'), kind: 'info' }))) return
  const title = findScene(book, todo[0].id)!.chapter.title || t('Chapter')
  await saveSnap(book.root, makeSnap(book, t('Before fixing “{title}”', { title })))
  useAI.setState({ running: 'chapter' })
  let placed = 0, missed = 0, before = 0, after = 0
  const still = new Set<string>()
  const left: string[] = []
  try {
    for (const { id } of todo) {
      const now = useStore.getState().book!
      const f = findScene(now, id)
      if (!f || useAI.getState().running !== 'chapter') break
      const failed = flagged(f.scene.text, now)
      if (!failed.length) continue
      st.notify('ok', t('Fixing “{title}”…', { title: f.scene.title }))
      const choice = assistantChoice('rewrite')
      const e = effective(choice.model, choice.effort)
      const reply = await ask({ model: e.model, effort: e.effort, orModel: choice.orModel, system: systemPrompt(now, 'rewrite', f.number), message: fixRequest(f.scene.text, failed, lang) })
      if (useAI.getState().running !== 'chapter') break
      const edits = parseJSON<FixEdit[]>(reply)
      if (!Array.isArray(edits)) throw new Error(t('Claude’s reply could not be read. Try again.'))
      // The text as it is now: you may have typed while Claude was reading.
      const latest = useStore.getState().book!
      const text = findScene(latest, id)?.scene.text ?? ''
      const result = placeFixes(text, edits, lang)
      missed += result.missed
      if (!result.fixes.length) continue
      if (!fixGuard(text, result.fixes).ok) { left.push(f.scene.title); continue }
      const rest = flagged(applyFixes(text, result.fixes), latest)
      before += failed.length
      after += rest.length
      rest.forEach(c => still.add(t(c.label)))
      useEdit.setState(s => ({ pending: { ...s.pending, [id]: result.fixes.map(x => ({ id: newId(), ...x })) } }))
      // The chapter on screen, so the changes show as they arrive.
      if (!placed) { st.setView('manuscript'); st.setPrefs({ mode: 'review' }); st.selectScene(id) }
      placed += result.fixes.length
    }
  } catch (err) {
    st.notify('error', (err as Error).message)
    return
  } finally {
    useAI.setState({ running: null })
  }
  const parts = [
    placed ? t('{n} fix(es) in the text: ✓ to accept, ✕ to reject. Flagged points: {a} now, {b} once all are accepted.', { n: placed, a: before, b: after }) : left.length ? '' : t('Claude proposed no fix.'),
    still.size ? t('Still flagged: {list}.', { list: [...still].join(', ') }) : '',
    missed ? t('Not placed, the words were not found in the text: {k}.', { k: missed }) : '',
    left.length ? t('Left as written, because the fixes amounted to a rewrite: {list}.', { list: left.join(', ') }) : '',
  ]
  st.notify(left.length || missed || !placed ? 'warn' : 'ok', parts.filter(Boolean).join(' '))
}

/** Hands a scene's waiting fixes to its editor, once. */
export function takePending(sceneId: string): Change[] | null {
  const list = useEdit.getState().pending[sceneId]
  if (!list) return null
  useEdit.setState(s => { const rest = { ...s.pending }; delete rest[sceneId]; return { pending: rest } })
  return list
}
