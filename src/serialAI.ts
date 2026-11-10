// Claude's two tasks for web novels: reading each chapter's opening and ending
// (does it hook, does it make the reader click Next?) and finding the threads
// the story has opened for the reader, from the chapter summaries.
import { create } from 'zustand'
import type { Thread, ThreadKind } from './lib/types'
import { chapterLabels } from './lib/chapters'
import { chapterClosing, chapterOpening, chapterText, hookCheckFresh, textKey } from './lib/serial'
import { estimateTokens, newId } from './lib/text'
import { ask, parseJSON } from './ai'
import { useStore } from './store'
import { t } from './i18n'

export const useSerialAI = create<{ busy: 'hooks' | 'threads' | null }>(() => ({ busy: null }))

/** Written chapters whose opening and ending Claude hasn't read since they last changed. */
export const hooksToCheck = () => (useStore.getState().book?.chapters ?? []).filter(c => chapterText(c).trim().length > 300 && !hookCheckFresh(c))

/** Tokens for reading these chapters' edges (≈ 350 words each, plus the instructions). */
export const hooksCost = (n: number) => 300 + n * 600

export async function checkHooks() {
  const st = useStore.getState()
  const book = st.book
  if (!book || useSerialAI.getState().busy) return
  const todo = hooksToCheck()
  if (!todo.length) return st.notify('ok', t('Every written chapter has been read since it last changed.'))
  const fr = book.meta.language === 'fr'
  const labels = chapterLabels(book.chapters, book.meta.language)
  useSerialAI.setState({ busy: 'hooks' })
  try {
    // Eight chapters a request keeps each reply short and readable.
    for (let i = 0; i < todo.length; i += 8) {
      const batch = todo.slice(i, i + 8)
      const blocks = batch.map(c => `<chapter n="${labels[book.chapters.indexOf(c)].number}" title="${c.title}">\n<opening>\n${chapterOpening(c)}\n</opening>\n<ending>\n${chapterClosing(c)}\n</ending>\n</chapter>`).join('\n')
      const reply = await ask({
        role: 'edit',
        system: fr
          ? 'Tu es éditeur de web novels (Royal Road). Tu juges si l’ouverture d’un chapitre accroche tout de suite et si sa fin donne envie de cliquer sur le chapitre suivant. Réponds uniquement en JSON valide, en français.'
          : 'You are a web novel editor (Royal Road). You judge whether a chapter’s opening hooks at once and whether its ending makes the reader click Next. Reply with valid JSON only.',
        message: `${blocks}\n\n${fr
          ? 'Pour chaque chapitre, note l’accroche de l’ouverture et la force de la fin de 1 (faible) à 5 (excellente), et dis en une phrase ce qui la rendrait plus forte si la note est 3 ou moins.'
          : 'For each chapter, rate the opening’s hook and the ending’s pull from 1 (weak) to 5 (excellent), and say in one sentence what would make it stronger when a rating is 3 or less.'}\nJSON: [{"n": 1, "hook": 4, "end": 2, "note": "..."}]`,
      })
      const list = parseJSON<{ n: number; hook: number; end: number; note?: string }[]>(reply)
      if (!list) throw new Error(t('Claude’s reply could not be read. Try again.'))
      for (const c of batch) {
        const r = list.find(x => Number(x.n) === labels[book.chapters.indexOf(c)].number)
        if (r) useStore.getState().updateChapter(c.id, { hookCheck: { of: textKey(chapterText(c)), hook: clamp(r.hook), end: clamp(r.end), note: String(r.note ?? '') } })
      }
    }
    useStore.getState().notify('ok', t('Openings and endings read: {n} chapters.', { n: todo.length }))
  } catch (e) { useStore.getState().notify('error', (e as Error).message) }
  useSerialAI.setState({ busy: null })
}

const clamp = (x: unknown) => Math.max(1, Math.min(5, Math.round(Number(x) || 3)))

const KINDS: ThreadKind[] = ['mystery', 'promise', 'setup', 'foreshadow']

/** What finding threads sends: the chapter summaries and what each scene reveals. */
function threadInput() {
  const book = useStore.getState().book!
  const labels = chapterLabels(book.chapters, book.meta.language)
  return book.chapters.map((c, i) => {
    const reveals = c.scenes.map(s => s.reveals?.trim()).filter(Boolean).join(' ')
    const body = [c.summary?.trim(), reveals].filter(Boolean).join(' / ')
    return body ? `${labels[i].number}. ${body}` : ''
  }).filter(Boolean).join('\n')
}

export const threadsCost = () => 600 + estimateTokens(threadInput()) + 400

/** Claude reads the summaries and lists the threads opened, touched again and paid off; new ones are added, known ones updated. */
export async function findThreads() {
  const st = useStore.getState()
  const book = st.book
  if (!book || useSerialAI.getState().busy) return
  const input = threadInput()
  if (!input) return st.notify('warn', t('No chapter summaries yet: update them first (Plan → Dashboard).'))
  const fr = book.meta.language === 'fr'
  const labels = chapterLabels(book.chapters, book.meta.language)
  const byNumber = (n: unknown) => book.chapters[labels.findIndex(l => l.number === Number(n))]?.id ?? null
  const known = book.meta.threads ?? []
  useSerialAI.setState({ busy: 'threads' })
  try {
    const reply = await ask({
      role: 'edit',
      system: fr
        ? 'Tu aides l’auteur d’un web novel à suivre les promesses faites au lecteur : mystères, promesses, mises en place, présages. Réponds uniquement en JSON valide, en français.'
        : 'You help a web novel author keep track of the promises made to the reader: mysteries, promises, setups, foreshadowing. Reply with valid JSON only.',
      message: `<chapters>\n${input}\n</chapters>\n<known_threads>\n${known.map(k => `${k.id}: ${k.text}`).join('\n') || '-'}\n</known_threads>\n\n${fr
        ? 'Liste les fils que le lecteur attend de voir résolus : chacun en une ligne, son type (mystery, promise, setup, foreshadow), le chapitre où il est planté, ceux qui le font avancer, et celui qui le résout s’il l’est. Pour un fil déjà connu, donne son id.'
        : 'List the threads the reader is waiting to see paid off: each in one line, its kind (mystery, promise, setup, foreshadow), the chapter it is planted in, the chapters that move it, and the one that resolves it if any. For a known thread, give its id.'}\nJSON: [{"id": "known id or empty", "text": "...", "kind": "mystery", "planted": 3, "touched": [7, 12], "resolved": null}]`,
    })
    const list = parseJSON<{ id?: string; text: string; kind?: string; planted?: number; touched?: number[]; resolved?: number | null }[]>(reply)
    if (!list) throw new Error(t('Claude’s reply could not be read. Try again.'))
    const threads = (useStore.getState().book!.meta.threads ?? []).map(k => ({ ...k }))
    let added = 0
    for (const x of list) {
      if (!x.text?.trim()) continue
      const touched = (x.touched ?? []).map(byNumber).filter((id): id is string => !!id)
      const was = threads.find(k => k.id === x.id)
      if (was) {
        // Known: only what it adds, never anything you wrote taken away.
        Object.assign(was, { touched: [...new Set([...was.touched, ...touched])], resolved: was.resolved ?? (x.resolved ? byNumber(x.resolved) : null), planted: was.planted ?? byNumber(x.planted) })
        continue
      }
      threads.push({ id: newId(), text: x.text.trim(), kind: KINDS.includes(x.kind as ThreadKind) ? x.kind as ThreadKind : 'mystery', planted: byNumber(x.planted), touched, resolved: x.resolved ? byNumber(x.resolved) : null } satisfies Thread)
      added++
    }
    useStore.getState().updateMeta({ threads })
    useStore.getState().notify('ok', t('{n} new threads found; the known ones are updated.', { n: added }))
  } catch (e) { useStore.getState().notify('error', (e as Error).message) }
  useSerialAI.setState({ busy: null })
}
