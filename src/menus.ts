// The content of every right-click menu, one function per place. Screens call
// these with what was clicked; the menu itself is drawn by ContextMenuHost.
import { ownShare } from './lib/context'
import type { EditorView } from '@codemirror/view'
import { ask as askDialog } from '@tauri-apps/plugin-dialog'
import { findScene, useStore } from './store'
import { askText, type MenuItem } from './contextMenu'
import { t } from './i18n'
import { buildMatcher, findMentions } from './lib/context'
import { allowedKinds, chapterLabels } from './lib/chapters'
import { stripInline } from './lib/inline'
import { pasteText } from './lib/paste'
import { countWords, foldText, locateQuote } from './lib/text'
import { ENTRY_TYPES, typeInfo, type ActionId, type Entry, type EntryType, type Include, type Scene, type SceneStatus } from './lib/types'
import { accept, discard, getEditorView, retry, runAction, writeChapter, writeFromPlan } from './editor/actions'
import { proposalField } from './editor/cm'
import { insertPlaceholder, toggleInline, unknownNames } from './editor/marks'
import { cutToDarlings, removeComment } from './writing'
import { deleteMessage, turnIntoEntries, useChat } from './chat'

const NAMED_TYPES: EntryType[] = ENTRY_TYPES.map(x => x.type).filter(x => !['style', 'wordlist', 'excerpt'].includes(x))

// --- Text ------------------------------------------------------------------------------

async function pasteInto(view: EditorView, plain: boolean) {
  let text = ''
  try { text = await navigator.clipboard.readText() } catch { useStore.getState().notify('warn', t('The system did not allow reading the clipboard. Use Ctrl+V.')); return }
  if (!text) return
  const sel = view.state.selection.main
  const line = view.state.doc.lineAt(sel.from)
  const out = plain ? text.replace(/\r\n?/g, '\n') : pasteText('', text, useStore.getState().book!.meta.language, view.state.sliceDoc(line.from, sel.from))
  view.dispatch({ ...view.state.replaceSelection(out), scrollIntoView: true, userEvent: 'input.paste' })
  view.focus()
}

function readAloud(text: string) {
  const synth = window.speechSynthesis
  if (!synth) return
  if (synth.speaking) { synth.cancel(); return }
  const lang = useStore.getState().book!.meta.language
  const u = new SpeechSynthesisUtterance(stripInline(text))
  u.lang = lang === 'fr' ? 'fr-FR' : 'en-US'
  const voice = synth.getVoices().find(v => v.lang.toLowerCase().startsWith(lang))
  if (voice) u.voice = voice
  synth.speak(u)
}

/** The menu of the manuscript text: edit, ask Claude, notes, and what is under the pointer (a name, a comment, a proposal). */
export function editorMenu(view: EditorView, pos: number): MenuItem[] {
  const st = useStore.getState()
  const book = st.book!
  const doc = view.state.doc
  const sel = view.state.selection.main
  const has = !sel.empty
  const text = view.state.sliceDoc(sel.from, sel.to)
  const line = doc.lineAt(pos)
  const items: (MenuItem | false)[] = []
  const ai = (a: ActionId) => () => { view.focus(); runAction(a, '', {}) }

  if (view.state.field(proposalField, false)) {
    items.push({ label: t('Accept the proposal'), onClick: () => accept() }, { label: t('Retry'), onClick: () => retry() }, { label: t('Discard the proposal'), onClick: () => discard() }, { separator: true })
  }

  // A bible name under the pointer.
  const matcher = buildMatcher(book.entries)
  const mention = findMentions(line.text, matcher).find(m => pos >= line.from + m.from && pos <= line.from + m.to)
  const entry = mention && book.entries.find(e => e.slug === mention.slug)
  if (entry) {
    items.push({ label: t('Open {name}', { name: entry.name }), onClick: () => st.showEntry(entry.slug) })
    if (useStore.getState().view === 'manuscript') items.push({ label: t('Open {name} beside', { name: entry.name }), onClick: () => { st.setPrefs({ dual: 'bible' }); st.showEntry(entry.slug) } })
    const alias = text.trim()
    if (has && alias.length >= 2 && alias.length <= 40 && !alias.includes('\n') && foldText(alias) !== foldText(entry.name) && !entry.aliases.some(a => foldText(a) === foldText(alias))) {
      items.push({ label: t('Add “{text}” as an alias of {name}', { text: alias, name: entry.name }), onClick: () => st.updateEntry(entry.slug, { aliases: [...entry.aliases, alias] }) })
    }
    items.push({ separator: true })
  }

  // A capitalised name the bible doesn't know.
  const ignored = new Set((book.meta.ignored ?? []).map(foldText))
  const unknown = unknownNames(line.text, matcher, ignored).find(u => pos >= line.from + u.from && pos <= line.from + u.to)
  if (unknown) {
    items.push({
      label: t('Add “{name}” to the bible as…', { name: unknown.name }),
      sub: NAMED_TYPES.map(ty => ({ label: t(typeInfo(ty).label), onClick: () => {
        const e = st.addEntry(ty, unknown.name)
        st.notify('ok', t('{name} added to the bible.', { name: unknown.name }), { label: t('Open'), run: () => st.showEntry(e.slug) })
      } })),
    }, { label: t('Ignore “{name}”', { name: unknown.name }), onClick: () => st.updateMeta({ ignored: [...(book.meta.ignored ?? []), unknown.name] }) }, { separator: true })
  }

  // A margin comment under the pointer.
  const scene = findScene(book, st.sceneId)?.scene
  const full = doc.toString()
  const comment = scene?.comments?.find(c => { const at = locateQuote(full, c.quote, c.at); return at >= 0 && pos >= at && pos <= at + c.quote.length })
  if (scene && comment) {
    items.push({ label: t('Show this comment in the margin'), onClick: () => st.setPrefs({ rightTab: 'notes', mode: 'write' }) }, { label: t('Delete this comment'), danger: true, onClick: () => removeComment(scene.id, comment.id) }, { separator: true })
  }

  items.push(
    { label: t('Cut'), disabled: !has, onClick: () => { navigator.clipboard?.writeText(text); view.dispatch(view.state.replaceSelection('')); view.focus() } },
    { label: t('Copy'), disabled: !has, onClick: () => { navigator.clipboard?.writeText(text) } },
    { label: t('Paste'), onClick: () => pasteInto(view, false) },
    { label: t('Paste as plain text'), onClick: () => pasteInto(view, true) },
    { label: t('Select all'), onClick: () => { view.dispatch({ selection: { anchor: 0, head: doc.length } }); view.focus() } },
    { separator: true },
  )
  if (has) items.push({ label: t('Italic'), onClick: () => { toggleInline(view, '*'); view.focus() } }, { label: t('Bold'), onClick: () => { toggleInline(view, '**'); view.focus() } }, { separator: true })

  items.push({ header: t('Ask Claude') })
  if (has) {
    items.push(
      { label: t('Rewrite'), onClick: ai('rewrite') }, { label: t('Expand'), onClick: ai('expand') }, { label: t('Shorten'), onClick: ai('shorten') },
      { label: t('Show it'), onClick: ai('show') }, { label: t('Sharpen dialogue'), onClick: ai('dialogue') },
      { label: t('Synonyms'), disabled: text.length > 60, onClick: () => useStore.setState({ dialog: 'synonyms' }) },
    )
  } else {
    items.push({ label: t('Continue from here'), onClick: ai('continue') }, { label: t('Describe here'), onClick: ai('describe') })
  }
  items.push({ separator: true })
  if (has) {
    items.push(
      { label: t('Comment on this…'), onClick: () => st.setPrefs({ rightTab: 'notes', mode: 'write' }) },
      { label: t('Cut to the darlings drawer'), onClick: () => { if (scene) cutToDarlings(view, scene.id) } },
    )
  }
  items.push({ label: t('Drop a placeholder'), onClick: () => { insertPlaceholder(view); view.focus() } })
  if (has) {
    items.push(
      { label: window.speechSynthesis?.speaking ? t('Stop reading') : t('Read aloud'), onClick: () => readAloud(text) },
      { label: t('Search the book for this'), onClick: () => useStore.setState({ dialog: 'find' }) },
      { label: t('New bible entry from this'), disabled: text.length > 60, onClick: () => useStore.setState({ dialog: 'entry' }) },
    )
  }
  return items.filter(Boolean) as MenuItem[]
}

// --- Scenes and chapters ---------------------------------------------------------------------

const STATUSES: [SceneStatus, string][] = [['draft', 'Draft'], ['revised', 'Revised'], ['done', 'Done']]

function statusAndPov(scene: Scene): MenuItem[] {
  const st = useStore.getState()
  const characters = st.book!.entries.filter(e => e.type === 'character').sort((a, b) => a.name.localeCompare(b.name))
  return [
    { label: t('Status'), sub: STATUSES.map(([id, label]) => ({ label: t(label), checked: scene.status === id, onClick: () => st.updateScene(scene.id, { status: id }) })) },
    { label: t('Point of view'), sub: [{ label: t('None'), checked: !scene.pov, onClick: () => st.updateScene(scene.id, { pov: null }) }, ...characters.map(c => ({ label: c.name, checked: scene.pov === c.slug, onClick: () => st.updateScene(scene.id, { pov: c.slug }) }))] },
  ]
}

/** A scene right after another one, with the same text and card. */
export function duplicateScene(sceneId: string) {
  const st = useStore.getState()
  const found = findScene(st.book, sceneId)
  if (!found) return
  const id = st.addScene(found.chapter.id, `${found.scene.title} (${t('copy')})`, { stay: true })
  const { text, note, pov, time, place, lines } = found.scene
  st.updateScene(id, { text, note, pov, time, place, lines, status: 'draft' })
  st.moveScene(id, found.chapter.id, found.index + 1)
}

export function sceneMenu(sceneId: string, opts: { card?: boolean } = {}): MenuItem[] {
  const st = useStore.getState()
  const book = st.book!
  const found = findScene(book, sceneId)
  if (!found) return []
  const { scene, chapter } = found
  const labels = chapterLabels(book.chapters, book.meta.language)
  const lines = book.entries.filter(e => e.type === 'storyline')
  return [
    { label: t('Write it'), onClick: () => st.selectScene(sceneId) },
    { label: t('Write it from the plan (Claude)'), disabled: !scene.note?.trim(), onClick: () => writeFromPlan(sceneId) },
    opts.card && st.view !== 'manuscript' && { label: t('Open in the second pane'), onClick: () => { st.setPrefs({ dual: 'manuscript' }); st.selectScene(sceneId) } },
    { label: t('Rename…'), onClick: async () => { const v = await askText(t('Scene title'), scene.title); if (v?.trim()) st.updateScene(sceneId, { title: v.trim() }) } },
    { separator: true },
    ...statusAndPov(scene),
    opts.card && lines.length > 0 && { label: t('Story lines'), sub: lines.map(l => ({ label: l.name, checked: !!scene.lines?.includes(l.slug), onClick: () => st.updateScene(sceneId, { lines: scene.lines?.includes(l.slug) ? scene.lines.filter(x => x !== l.slug) : [...(scene.lines ?? []), l.slug] }) })) },
    // Revised or done scenes mostly written by you are sent as samples of your voice; this overrides the count.
    { label: t('Sample of my voice'), checked: scene.status !== 'draft' && ownShare(scene) <= 0.25, disabled: scene.status === 'draft',
      onClick: () => st.updateScene(sceneId, { extra: { ...scene.extra, aiWords: ownShare(scene) <= 0.25 ? (scene.text.match(/\S+/g) ?? []).length : 0 } }) },
    book.chapters.length > 1 && { label: t('Move to chapter'), sub: book.chapters.map((c, i) => ({ label: `${labels[i].label}${c.title && c.title !== labels[i].label ? ` · ${c.title}` : ''}`, checked: c.id === chapter.id, disabled: c.id === chapter.id, onClick: () => st.moveScene(sceneId, c.id, c.scenes.length) })) },
    { separator: true },
    { label: t('New scene after'), onClick: () => { const id = st.addScene(chapter.id, `${t('Scene')} ${chapter.scenes.length + 1}`, { stay: true }); st.moveScene(id, chapter.id, found.index + 1) } },
    { label: t('Duplicate'), onClick: () => duplicateScene(sceneId) },
    { separator: true },
    { label: t('Remove scene'), danger: true, onClick: async () => { if (await askDialog(t('Move "{title}" to the book\'s trash folder?', { title: scene.title }), { title: t('Remove scene'), kind: 'warning' })) st.removeScene(sceneId) } },
  ].filter(Boolean) as MenuItem[]
}

export function chapterMenu(chapterId: string): MenuItem[] {
  const st = useStore.getState()
  const book = st.book!
  const i = book.chapters.findIndex(c => c.id === chapterId)
  const c = book.chapters[i]
  if (!c) return []
  const kinds = allowedKinds(i, book.chapters.length)
  const kindNames = { chapter: 'Numbered chapter', prologue: 'Prologue', epilogue: 'Epilogue' }
  const words = c.scenes.reduce((n, s) => n + countWords(s.text), 0)
  return [
    { label: t('New scene'), onClick: () => st.addScene(chapterId, `${t('Scene')} ${c.scenes.length + 1}`) },
    { label: t('Write the chapter from the plan (Claude)'), disabled: !c.scenes.some(s => !s.text.trim() && s.note?.trim()), onClick: () => writeChapter(chapterId) },
    { label: t('Rename…'), onClick: async () => { const v = await askText(t('Chapter title'), c.title); if (v !== null) st.updateChapter(chapterId, { title: v.trim() }) } },
    kinds.length > 1 && { label: t('Kind'), sub: kinds.map(k => ({ label: t(kindNames[k]), checked: c.kind === k, onClick: () => st.updateChapter(chapterId, { kind: k }) })) },
    { label: c.part ? t('Part: {title}…', { title: c.part }) : t('Start a part here…'), onClick: async () => { const v = await askText(t('Title of the part that starts here (empty: none)'), c.part ?? ''); if (v !== null) st.updateChapter(chapterId, { part: v.trim() }) } },
    { separator: true },
    { label: t('Move up'), disabled: i === 0, onClick: () => st.moveChapter(chapterId, i - 1) },
    { label: t('Move down'), disabled: i === book.chapters.length - 1, onClick: () => st.moveChapter(chapterId, i + 1) },
    { separator: true },
    { label: t('Delete the chapter'), danger: true, onClick: async () => {
      const ok = await askDialog(t('Move the chapter "{title}" ({n} scenes, {w} words) to the book\'s trash folder?', { title: c.title || t('Untitled'), n: c.scenes.length, w: words }), { title: t('Delete the chapter'), kind: 'warning' })
      if (ok) st.removeChapter(chapterId)
    } },
  ].filter(Boolean) as MenuItem[]
}

/** Right-click on empty space of the plan board or the chapter list. */
export function newThingsMenu(): MenuItem[] {
  const st = useStore.getState()
  const fr = st.book!.meta.language === 'fr'
  return [{ label: t('New chapter'), onClick: () => st.addChapter(`${fr ? 'Chapitre' : 'Chapter'} ${st.book!.chapters.filter(c => c.kind === 'chapter').length + 1}`, { stay: true }) }]
}

// --- Bible -------------------------------------------------------------------------------------

const INCLUDES: [Include, string][] = [['auto', 'When mentioned'], ['always', 'Always'], ['never', 'Never (unless @-mentioned)'], ['secret', 'Secret: never, not even @-mentioned']]

export function entryMenu(slug: string): MenuItem[] {
  const st = useStore.getState()
  const book = st.book!
  const e = book.entries.find(x => x.slug === slug)
  if (!e) return []
  const plain = ['style', 'wordlist', 'excerpt'].includes(e.type)
  return [
    { label: t('Open'), onClick: () => st.showEntry(slug) },
    st.view !== 'bible' && { label: t('Open in the second pane'), onClick: () => { st.setPrefs({ dual: 'bible' }); st.showEntry(slug) } },
    !plain && { separator: true },
    !plain && { label: t('Sent to the AI'), sub: INCLUDES.map(([id, label]) => ({ label: t(label), checked: e.include === id, onClick: () => st.updateEntry(slug, { include: id }) })) },
    !plain && { label: t('Add a tag…'), onClick: async () => { const v = await askText(t('Tag'), '', t('villains, act 2, magic users')); const tag = v?.trim(); if (tag && !e.tags?.includes(tag)) st.updateEntry(slug, { tags: [...(e.tags ?? []), tag] }) } },
    !plain && !!e.tags?.length && { label: t('Remove a tag'), sub: e.tags.map(tag => ({ label: tag, onClick: () => st.updateEntry(slug, { tags: e.tags!.filter(x => x !== tag) }) })) },
    !!book.meta.series && e.type !== 'style' && { label: t('Shared with every book of the series'), checked: !!e.shared, onClick: () => st.shareEntry(slug, !e.shared) },
    e.type !== 'style' && { separator: true },
    e.type !== 'style' && { label: t('Duplicate'), onClick: () => duplicateEntry(e) },
    e.type !== 'style' && { label: t('Remove entry'), danger: true, onClick: async () => { if (await askDialog(t('Move "{title}" to the book\'s trash folder?', { title: e.name }), { title: t('Remove entry'), kind: 'warning' })) st.removeEntry(slug) } },
  ].filter(Boolean) as MenuItem[]
}

/** A copy of an entry under a new name (aliases are not copied: two entries must not answer to one name). */
export function duplicateEntry(e: Entry) {
  const st = useStore.getState()
  const copy = st.addEntry(e.type, `${e.name} (${t('copy')})`)
  st.updateEntry(copy.slug, { short: e.short, full: e.full, facts: e.facts, links: e.links, sends: e.sends, tags: e.tags, voice: e.voice, knows: e.knows, unaware: e.unaware, include: e.include, notes: e.notes })
}

// --- Chat --------------------------------------------------------------------------------------

export function messageMenu(index: number): MenuItem[] {
  const m = useChat.getState().messages[index]
  if (!m) return []
  const st = useStore.getState()
  return [
    { label: t('Copy'), onClick: () => { navigator.clipboard?.writeText(m.text) } },
    m.role === 'assistant' && { label: t('Insert in the manuscript'), onClick: () => {
      const v = getEditorView()
      if (!v) return st.notify('warn', t('Open a scene in the Manuscript first.'))
      v.dispatch({ ...v.state.replaceSelection(m.text), scrollIntoView: true })
      v.focus()
    } },
    { label: t('Turn into entries'), onClick: () => turnIntoEntries() },
    { separator: true },
    { label: t('Delete the message'), danger: true, onClick: () => deleteMessage(index) },
  ].filter(Boolean) as MenuItem[]
}

// --- Page view -----------------------------------------------------------------------------------

export function paragraphMenu(sceneId: string, goEdit: () => void): MenuItem[] {
  return [{ label: t('Edit this paragraph'), onClick: goEdit }, { label: t('Go to the scene'), onClick: () => { useStore.getState().setPrefs({ page: false }); useStore.getState().selectScene(sceneId) } }]
}
