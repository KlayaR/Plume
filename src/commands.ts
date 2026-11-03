// What Ctrl+K can do besides opening a scene or an entry: the app's main
// actions, found by typing a few letters of their name.
import { useStore, type BibleTab, type PlanTab, type View } from './store'
import { askText } from './contextMenu'
import { t } from './i18n'
import { newThingsMenu } from './menus'
import { writeChapter, writeFromPlan } from './editor/actions'
import { fixFlagged, openEdit } from './edit'
import { toggleScratch } from './scratch'

export interface Command { id: string; label: string; keys?: string; where?: View[]; run: () => void }

export function commands(): Command[] {
  const st = useStore.getState()
  const set = useStore.setState
  const serial = st.book?.meta.kind === 'serial'
  const planTab = (id: PlanTab, label: string): Command => ({ id: `plan-${id}`, label, where: ['plan'], run: () => set({ view: 'plan', planTab: id }) })
  const bibleTab = (id: BibleTab, label: string): Command => ({ id: `bible-${id}`, label, where: ['bible'], run: () => set({ view: 'bible', bibleTab: id }) })
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
    ...(serial ? [planTab('arcs', t('Plan → Arcs')), planTab('release', t('Plan → Release')), planTab('threads', t('Plan → Threads'))] : [planTab('structure', t('Plan → Structure'))]),
    ...(st.prefs.simple ? [] : [planTab('timeline', t('Plan → Timeline')), planTab('lines', t('Plan → Story lines')), planTab('dashboard', t('Plan → Dashboard'))]),
    { id: 'new-character', label: t('New character…'), where: ['bible'], run: async () => { const name = (await askText(t('Name of the new entry')))?.trim(); if (name) { st.addEntry('character', name); set({ view: 'bible', bibleTab: 'entry' }) } } },
    { id: 'entry-history', label: t('Earlier versions of this entry…'), where: ['bible'], run: () => { const slug = useStore.getState().entrySlug; if (slug) set({ dialog: 'history', dialogArg: slug }) } },
    bibleTab('review', t('Bible → To review')),
    bibleTab('aicheck', t('Bible → AI check')),
    ...(st.prefs.simple ? [] : [bibleTab('table', t('Bible → Table')), bibleTab('tracker', t('Bible → Presence')), bibleTab('map', t('Bible → Map')), bibleTab('relations', t('Bible → Relations')), bibleTab('contradictions', t('Bible → Contradictions'))]),
    { id: 'export', label: t('Export…'), run: () => set({ dialog: 'export' }) },
    { id: 'snapshots', label: t('Snapshots'), run: () => set({ dialog: 'snapshots' }) },
    { id: 'find', label: t('Find and replace'), keys: 'Ctrl+Shift+F', run: () => set({ dialog: 'find' }) },
    { id: 'outline', label: t('Propose an outline'), where: ['plan'], run: () => set({ dialog: 'outline' }) },
    { id: 'zen', label: t('Distraction-free mode'), keys: 'F11', where: ['manuscript'], run: () => st.setPrefs({ zen: !st.prefs.zen }) },
    { id: 'dual', label: t('Bible beside the text'), where: ['manuscript'], run: () => st.setPrefs({ dual: st.prefs.dual === 'bible' ? null : 'bible' }) },
    { id: 'scratch', label: t('Scratch pad'), keys: 'Ctrl+J', run: toggleScratch },
    { id: 'settings', label: t('Settings'), keys: 'Ctrl+,', run: () => set({ showSettings: true }) },
    { id: 'voice', label: t('Settings → Voice'), run: () => set({ showSettings: true, settingsTab: 'voice' }) },
    { id: 'claude', label: t('Settings → Claude'), run: () => set({ showSettings: true, settingsTab: 'claude' }) },
    { id: 'everything', label: t(st.prefs.simple ? 'Show everything' : 'Simpler view (hide the less used tabs)'), run: () => st.setPrefs({ simple: !st.prefs.simple }) },
    { id: 'help', label: t('Help'), keys: 'F1', run: () => set({ dialog: 'help' }) },
    { id: 'shortcuts', label: t('Keyboard shortcuts'), keys: 'Ctrl+/', run: () => set({ dialog: 'shortcuts' }) },
    { id: 'close', label: t('Close the book'), run: () => st.close() },
  ]
  // Your own shortcut is the one shown.
  return list.map(c => st.prefs.commandKeys[c.id] ? { ...c, keys: st.prefs.commandKeys[c.id] } : c)
}
