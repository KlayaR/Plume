// What Ctrl+K can do besides opening a scene or an entry: the app's main
// actions, found by typing a few letters of their name.
import { useStore, type BibleTab, type PlanTab, type View } from './store'
import { askText, type MenuItem } from './contextMenu'
import { t } from './i18n'
import { chapterMenu, entryMenu, newThingsMenu, sceneMenu } from './menus'
import { writeChapter, writeFromPlan } from './editor/actions'
import { fixFlagged, openEdit } from './edit'
import { showScratch, toggleScratch } from './scratch'
import { typeInfo, WORLD_TYPES, type EntryType } from './lib/types'
import { newId } from './lib/text'
import { toggleDraft, useDraft } from './editor/draft'

export interface Command {
  id: string
  label: string
  keys?: string
  where?: View[]
  run: () => void
  /** Taken from a right-click menu: found by typing, but gets no shortcut of its own. */
  menu?: boolean
}

/** A right-click menu as actions: submenus become "Status: Draft". */
function fromMenu(prefix: string, items: MenuItem[], where: View[]): Command[] {
  return items.flatMap(i => {
    if (i.sub) return fromMenu(`${prefix}: ${i.label}`, i.sub, where)
    if (!i.label || !i.onClick || i.disabled) return []
    return [{ id: `${prefix}: ${i.label}`, label: `${prefix}: ${i.label}`, where, run: i.onClick, menu: true }]
  })
}

export function commands(): Command[] {
  const st = useStore.getState()
  const set = useStore.setState
  const serial = st.book?.meta.kind === 'serial'
  const planTab = (id: PlanTab, label: string): Command => ({ id: `plan-${id}`, label, where: ['plan'], run: () => set({ view: 'plan', planTab: id }) })
  const bibleTab = (id: BibleTab, label: string): Command => ({ id: `bible-${id}`, label, where: ['bible'], run: () => set({ view: 'bible', bibleTab: id }) })
  // A switch has nothing to show on screen when it flips: say which way it went.
  const toggle = (id: string, label: string, pref: 'focus' | 'typewriter' | 'selBar' | 'enterBreaks' | 'autoCapital' | 'pinLeft' | 'pinRight' | 'entryPaper', where?: View[]): Command => ({
    id, label, where, run: () => { const on = !useStore.getState().prefs[pref]; st.setPrefs({ [pref]: on }); st.notify('ok', `${label}: ${on ? t('on') : t('off')}`) },
  })
  const settings = (id: string, name: string): Command => ({ id: `settings-${id}`, label: `${t('Settings')} → ${t(name)}`, run: () => set({ showSettings: true, settingsTab: id }) })
  const stepScene = (by: number) => () => { const s = useStore.getState(); const all = s.book?.chapters.flatMap(c => c.scenes) ?? []; const next = all[all.findIndex(x => x.id === s.sceneId) + by]; if (next) s.selectScene(next.id) }
  const scene = st.book?.chapters.flatMap(c => c.scenes).find(s => s.id === st.sceneId)
  const chapter = st.book?.chapters.find(c => c.scenes.some(s => s.id === st.sceneId))
  const list: Command[] = [
    { id: 'manuscript', label: t('Go to the Manuscript'), run: () => st.setView('manuscript') },
    { id: 'plan', label: t('Go to the Plan'), run: () => st.setView('plan') },
    { id: 'bible', label: t('Go to the Bible'), run: () => st.setView('bible') },
    { id: 'write', label: t('Write mode'), where: ['manuscript'], run: () => { st.setView('manuscript'); st.setPrefs({ mode: 'write' }) } },
    { id: 'review', label: t('Review mode'), where: ['manuscript'], run: () => { st.setView('manuscript'); st.setPrefs({ mode: 'review' }) } },
    { id: 'chapter', label: t('New chapter'), where: ['plan'], run: () => newThingsMenu()[0]?.onClick?.() },
    { id: 'write-scene', label: t('Write this scene from the plan (Claude)'), where: ['manuscript'], run: () => { const id = useStore.getState().sceneId; if (id) writeFromPlan(id) } },
    { id: 'edit-chapter', label: t('Edit this chapter (Claude)…'), where: ['manuscript'], run: () => { const s = useStore.getState(); const c = s.book?.chapters.find(x => x.scenes.some(y => y.id === s.sceneId)); if (c) openEdit(c.id) } },
    { id: 'fix-flagged', label: t('Fix what’s flagged (Claude)…'), where: ['manuscript'], run: () => { const s = useStore.getState(); const c = s.book?.chapters.find(x => x.scenes.some(y => y.id === s.sceneId)); if (c) fixFlagged(c.scenes.map(y => y.id)) } },
    { id: 'write-chapter', label: t('Write this chapter from the plan (Claude)'), where: ['manuscript'], run: () => { const s = useStore.getState(); const c = s.book?.chapters.find(x => x.scenes.some(y => y.id === s.sceneId)); if (c) writeChapter(c.id) } },
    { id: 'undo', label: t('Undo the last change'), keys: 'Ctrl+Z', where: ['plan', 'bible'], run: () => { if (!st.undoChange()) st.notify('ok', t('Nothing to undo.')) } },
    { id: 'redo', label: t('Redo the change'), keys: 'Ctrl+Y', where: ['plan', 'bible'], run: () => { if (!st.redoChange()) st.notify('ok', t('Nothing to redo.')) } },
    planTab('outline', t('Plan → Outline')),
    { id: 'outline-list', label: st.prefs.outlineList ? t('Outline as cards') : t('Outline as a list you type'), where: ['plan'], run: () => { st.setPrefs({ outlineList: !st.prefs.outlineList }); set({ view: 'plan', planTab: 'outline' }) } },
    planTab('board', t('Plan → Board')),
    ...(st.prefs.simple ? [] : [planTab('grid', t('Plan → Grid'))]),
    ...(serial ? [planTab('arcs', t('Plan → Arcs')), planTab('release', t('Plan → Release')), planTab('threads', t('Plan → Threads'))] : st.prefs.simple ? [] : [planTab('structure', t('Plan → Structure'))]),
    ...(st.prefs.simple ? [] : [planTab('timeline', t('Plan → Timeline')), planTab('lines', t('Plan → Story lines')), planTab('dashboard', t('Plan → Dashboard'))]),
    ...(['place', 'object', ...WORLD_TYPES].filter((x, i, all) => x !== 'character' && all.indexOf(x as EntryType) === i) as EntryType[]).map((type): Command => ({
      id: `new-${type}`, label: t('New entry: {type}…', { type: t(typeInfo(type).label) }), where: ['bible'],
      run: async () => { const name = (await askText(t('Name of the new entry')))?.trim(); if (name) st.addEntry(type, name) },
    })),
    { id: 'new-character', label: t('New character…'), where: ['bible'], run: async () => { const name = (await askText(t('Name of the new entry')))?.trim(); if (name) { st.addEntry('character', name); set({ view: 'bible', bibleTab: 'entry' }) } } },
    { id: 'entry-history', label: t('Earlier versions of this entry…'), where: ['bible'], run: () => { const slug = useStore.getState().entrySlug; if (slug) set({ dialog: 'history', dialogArg: slug }) } },
    bibleTab('entry', t('Bible → Entries')),
    ...(st.prefs.simple ? [] : [{ id: 'bible-gallery', label: t('Bible → Gallery'), where: ['bible'] as View[], run: () => { set({ view: 'bible', bibleTab: 'table' }); st.setPrefs({ bibleLayout: 'gallery' }) } }]),
    toggle('entry-paper', t('Read entries on paper'), 'entryPaper', ['bible']),
    bibleTab('review', t('Bible → To review')),
    bibleTab('aicheck', t('Bible → AI check')),
    ...(st.prefs.simple ? [] : [bibleTab('table', t('Bible → Table')), bibleTab('tracker', t('Bible → Presence')), bibleTab('map', t('Bible → Map')), bibleTab('relations', t('Bible → Relations')), bibleTab('contradictions', t('Bible → Contradictions'))]),
    { id: 'export', label: t('Export…'), run: () => set({ dialog: 'export' }) },
    { id: 'export-bible', label: t('Export the bible…'), where: ['bible'], run: () => set({ dialog: 'export', dialogArg: 'bible' }) },
    { id: 'export-outline', label: t('Export the outline…'), where: ['plan'], run: () => set({ dialog: 'export', dialogArg: 'outline' }) },
    { id: 'snapshots', label: t('Snapshots'), run: () => set({ dialog: 'snapshots' }) },
    { id: 'find', label: t('Find and replace'), keys: 'Ctrl+Shift+F', run: () => set({ dialog: 'find' }) },
    { id: 'outline', label: t('Propose an outline'), where: ['plan'], run: () => set({ dialog: 'outline' }) },
    { id: 'zen', label: t('Distraction-free mode'), keys: 'F11', where: ['manuscript'], run: () => st.setPrefs({ zen: !st.prefs.zen }) },
    { id: 'draft', label: useDraft.getState().on ? t('Leave draft mode') : t('Draft mode'), where: ['manuscript'], run: toggleDraft },
    { id: 'dual', label: t('Bible beside the text'), where: ['manuscript'], run: () => st.setPrefs({ dual: st.prefs.dual === 'bible' ? null : 'bible' }) },
    { id: 'dual-plan', label: t('{name} beside', { name: t('Plan') }), where: ['manuscript'], run: () => st.setPrefs({ dual: 'plan' }) },
    { id: 'dual-manuscript', label: t('{name} beside', { name: t('Manuscript') }), where: ['plan', 'bible'], run: () => st.setPrefs({ dual: 'manuscript' }) },
    { id: 'dual-off', label: t('One view only'), run: () => st.setPrefs({ dual: null }) },
    { id: 'previous-scene', label: t('Previous scene'), keys: 'Ctrl+PageUp', where: ['manuscript'], run: stepScene(-1) },
    { id: 'next-scene', label: t('Next scene'), keys: 'Ctrl+PageDown', where: ['manuscript'], run: stepScene(1) },
    { id: 'view-sheet', label: t('View: {name}', { name: t('Sheet') }), where: ['manuscript'], run: () => st.setPrefs({ page: false }) },
    { id: 'view-page', label: t('View: {name}', { name: t('Page') }), where: ['manuscript'], run: () => st.setPrefs({ page: true }) },
    { id: 'view-scene', label: t('View: {name}', { name: t('Scene') }), where: ['manuscript'], run: () => st.setPrefs({ scope: 'scene' }) },
    { id: 'view-chapter', label: t('View: {name}', { name: t('Chapter') }), where: ['manuscript'], run: () => st.setPrefs({ scope: 'chapter' }) },
    { id: 'view-book', label: t('View: {name}', { name: t('Book') }), where: ['manuscript'], run: () => st.setPrefs({ scope: 'book' }) },
    toggle('focus-mode', t('Focus mode'), 'focus', ['manuscript']),
    toggle('typewriter', t('Typewriter scrolling'), 'typewriter', ['manuscript']),
    toggle('sel-bar', t('Bar on selected text'), 'selBar', ['manuscript']),
    toggle('enter-breaks', t('Enter, Enter, Enter'), 'enterBreaks', ['manuscript']),
    toggle('auto-capital', t('Automatic capitals'), 'autoCapital', ['manuscript']),
    toggle('pin-left', t('Keep the Chapters pane open'), 'pinLeft', ['manuscript']),
    toggle('pin-right', t('Keep the Claude pane open'), 'pinRight', ['manuscript']),
    { id: 'new-idea', label: t('New idea'), where: ['plan'], run: () => { st.updateMeta({ loose: [...(st.book?.meta.loose ?? []), { id: newId(), title: '', note: '' }] }); set({ view: 'plan', planTab: 'board' }) } },
    { id: 'scratch', label: t('Scratch pad'), keys: 'Ctrl+J', run: toggleScratch },
    { id: 'scratch-book', label: t('Scratch pad → In the book'), run: () => showScratch('book') },
    { id: 'settings', label: t('Settings'), keys: 'Ctrl+,', run: () => set({ showSettings: true }) },
    { id: 'voice', label: t('Settings → Voice'), run: () => set({ showSettings: true, settingsTab: 'voice' }) },
    { id: 'claude', label: t('Settings → Claude'), run: () => set({ showSettings: true, settingsTab: 'claude' }) },
    settings('appearance', 'Appearance'),
    settings('manuscript', 'Manuscript'),
    settings('writing', 'Writing'),
    settings('book', 'This book'),
    settings('about', 'About'),
    { id: 'interface-language', label: st.prefs.ui === 'fr' ? 'Interface in English' : 'Interface en français', run: () => st.setPrefs({ ui: st.prefs.ui === 'fr' ? 'en' : 'fr' }) },
    { id: 'agents', label: t('Agent tasks'), run: () => set({ dialog: 'agents' }) },
    { id: 'trial', label: t('Compare prompts'), run: () => set({ dialog: 'trial' }) },
    { id: 'tour', label: t('Quick tour'), run: () => set({ dialog: 'tour' }) },
    { id: 'everything', label: t(st.prefs.simple ? 'Show everything' : 'Simpler view (hide the less used tabs)'), run: () => st.setPrefs({ simple: !st.prefs.simple }) },
    { id: 'help', label: t('Help'), keys: 'F1', run: () => set({ dialog: 'help' }) },
    { id: 'shortcuts', label: t('Keyboard shortcuts'), keys: 'Ctrl+/', run: () => set({ dialog: 'shortcuts' }) },
    { id: 'close', label: t('Close the book'), run: () => st.close() },
    // What right-click offers on the scene, chapter or entry you are in.
    ...(scene ? fromMenu(t('Scene'), sceneMenu(scene.id), ['manuscript']) : []),
    ...(chapter ? fromMenu(t('Chapter'), chapterMenu(chapter.id), ['manuscript', 'plan']) : []),
    ...(st.entrySlug && st.book?.entries.some(e => e.slug === st.entrySlug) ? fromMenu(t('Entry'), entryMenu(st.entrySlug), ['bible']) : []),
  ]
  // Your own shortcut is the one shown.
  return list.map(c => st.prefs.commandKeys[c.id] ? { ...c, keys: st.prefs.commandKeys[c.id] } : c)
}
