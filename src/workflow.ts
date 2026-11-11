// The checks between the outline and the writing: the outline's quality check, the
// bible check and "Ready to write?". Their buttons are in Plan → Outline and in the
// Bible; when each was last run is kept in .plume/workflow.json.md of the book.
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { useStore } from './store'
import { ask, parseJSON } from './ai'
import { t } from './i18n'
import { outlineText } from './lib/outline'
import { gaps, readReady, type Marks } from './lib/workflow'
import { checkOutline, createEntriesFromOutline, grounding, useOutline } from './outline'
import { useChat } from './chat'

/** `open`: the Ready to write? panel is shown in the outline. */
export const useFlow = create<{ marks: Marks; busy: string | null; open: boolean }>(() => ({ marks: {}, busy: null, open: false }))
const FILE = '.plume/workflow.json.md'

export async function loadFlow() {
  const root = useStore.getState().book?.root
  if (!root) return
  try {
    const v = JSON.parse(await invoke<string>('read_text', { root, rel: FILE }))
    useFlow.setState({ marks: v && typeof v === 'object' ? v : {}, busy: null, open: false })
  } catch { useFlow.setState({ marks: {}, busy: null, open: false }) }
}

export function mark(patch: Partial<Marks>) {
  const marks = { ...useFlow.getState().marks, ...patch }
  useFlow.setState({ marks })
  const root = useStore.getState().book?.root
  if (root) invoke('write_text', { root, rel: FILE, content: JSON.stringify(marks, null, 1) }).catch(() => {})
}

const now = () => new Date().toISOString()

/** The outline's quality check, shown in Plan → Outline (run it on the first outline, and again once it is detailed). */
export async function runOutlineCheck() {
  const st = useStore.getState()
  st.setView('plan')
  useStore.setState({ planTab: 'outline' })
  useOutline.setState({ issues: null })
  await checkOutline()
  const issues = useOutline.getState().issues
  if (issues) mark({ outlineCheck: { date: now(), found: issues.length } })
}

/** The bible check: the entries the outline needs and the bible lacks, drafted into Bible → To review. */
export async function runBibleCheck() {
  const before = useChat.getState().proposals.length
  await createEntriesFromOutline()
  const found = useChat.getState().proposals.length - before
  if (found < 0) return
  mark({ bibleCheck: { date: now(), found } })
  if (found > 0) useStore.setState({ view: 'bible', bibleTab: 'review' })
  else useStore.getState().notify('ok', t('The bible has what the outline needs.'))
}

/**
 * Ready to write? Is everything there to write the book chapter by chapter? Claude reads the
 * outline and the bible, knowing what the free check already found, and lists what
 * still blocks, most blocking first.
 */
export async function runReady() {
  const book = useStore.getState().book
  if (!book || useFlow.getState().busy) return
  const F = book.meta.language === 'fr'
  const [a, b] = book.meta.ai.chapterWords
  const known = gaps(book)
  const local = known.map(g => `- ${g.code}${g.n ? ` ch ${g.n}` : ''}${g.name ? ` ${g.name}` : ''}${g.count ? ` ×${g.count}` : ''}`).join('\n')
  const bible = book.entries.filter(e => !['style', 'wordlist', 'excerpt'].includes(e.type) && e.include !== 'secret')
    .map(e => `- ${e.name} (${e.type})${e.short.trim() ? `: ${e.short.trim()}` : ''}${e.type === 'character' ? (Object.values(e.voice ?? {}).some(v => (v ?? '').trim()) ? ' [voice card: yes]' : ' [voice card: none]') : ''}`).join('\n')
  useFlow.setState({ busy: 'ready', open: true })
  try {
    const reply = await ask({ json: 'object', role: 'edit',
      system: F ? 'Tu es directeur littéraire. Tu dis à un romancier si son plan et sa bible suffisent pour écrire le livre chapitre par chapitre, et sinon ce qui manque. Réponds uniquement en JSON valide, en français.' : 'You are an editor. You tell a novelist whether their outline and story bible are enough to write the book chapter by chapter, and if not, what is missing. Reply with valid JSON only.',
      message: [
        grounding(book),
        `<bible_entries>\n${bible || '-'}\n</bible_entries>`,
        `<outline>\n${outlineText(book)}\n</outline>`,
        local ? `<already_found>\n${local}\n</already_found>` : '',
        F ? `Le livre va être écrit par une IA, un chapitre à la fois, d’environ ${a} à ${b} mots, à partir de la carte de chaque scène et des fiches de la bible que la scène cite. Dis si tout est prêt. Vérifie :
- chaque chapitre : sa carte contient-elle assez de matière (ce qui se passe, qui est là, ce qui est révélé, la tension, le tournant, le lien avec avant et après) pour un chapitre complet, ou sera-t-il étiré ou inventé ?
- la bible : un personnage, un lieu, une règle, un objet dont le plan dépend et qui manque ou reste trop vague pour être écrit sans contradiction ;
- les arcs : pour chaque personnage, à la mesure de son importance, un arc qui commence, évolue et se conclut ;
- les contradictions entre le plan, les fondations et la bible ; les fils ouverts jamais repris.
Ne répète pas <already_found> (déjà signalé à l’auteur). Au plus 15 éléments, les plus bloquants d’abord, chacun avec une correction précise à faire avant d’écrire. "kind" : chapter, bible, arc, contradiction ou thread. "n" : le numéro du chapitre, s’il y en a un. "ready" : true seulement si rien ne bloque. "verdict" : deux ou trois phrases franches.`
          : `The book will be written by an AI, one chapter at a time, of about ${a} to ${b} words, from each scene's card and the bible entries the scene mentions. Say whether everything is ready. Check:
- each chapter: does its card hold enough material (what happens, who is there, what is revealed, the tension, the turn, the link with before and after) for a full chapter, or will it be padded or made up?
- the bible: a character, place, rule or object the outline depends on that is missing or too vague to be written without contradiction;
- the arcs: for each character, in proportion to their importance, an arc that starts, moves and concludes;
- contradictions between the outline, the foundation and the bible; threads opened and never picked up.
Don't repeat <already_found> (the author was told). At most 15 items, most blocking first, each with a precise fix to make before writing. "kind": chapter, bible, arc, contradiction or thread. "n": the chapter's number, if any. "ready": true only if nothing blocks. "verdict": two or three frank sentences.`,
        'JSON: {"ready": false, "verdict": "…", "items": [{"kind": "chapter", "n": 1, "title": "…", "fix": "…"}]}',
      ].filter(Boolean).join('\n\n'),
    })
    const read = readReady(parseJSON(reply), book.chapters.length)
    if (!read) throw new Error(t('Claude’s reply could not be read. Try again.'))
    // The free check counts too: the book is not ready while it still finds something.
    mark({ ready: { ...read, ready: read.ready && !known.length, date: now() } })
  } catch (e) { useStore.getState().notify('error', (e as Error).message) }
  finally { useFlow.setState({ busy: null }) }
}
