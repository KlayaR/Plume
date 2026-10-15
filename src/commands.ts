// What Ctrl+K can do besides opening a scene or an entry: the app's main
// actions, found by typing a few letters of their name.
import { useStore } from './store'
import { t } from './i18n'
import { newThingsMenu } from './menus'
import { writeChapter, writeFromPlan } from './editor/actions'

export interface Command { id: string; label: string; keys?: string; run: () => void }

export function commands(): Command[] {
  const st = useStore.getState()
  const set = useStore.setState
  const list: Command[] = [
    { id: 'manuscript', label: t('Go to the Manuscript'), run: () => st.setView('manuscript') },
    { id: 'plan', label: t('Go to the Plan'), run: () => st.setView('plan') },
    { id: 'bible', label: t('Go to the Bible'), run: () => st.setView('bible') },
    { id: 'write', label: t('Write mode'), run: () => { st.setView('manuscript'); st.setPrefs({ mode: 'write' }) } },
    { id: 'review', label: t('Review mode'), run: () => { st.setView('manuscript'); st.setPrefs({ mode: 'review' }) } },
    { id: 'chapter', label: t('New chapter'), run: () => newThingsMenu()[0]?.onClick?.() },
    { id: 'write-scene', label: t('Write this scene from the plan (Claude)'), run: () => { const id = useStore.getState().sceneId; if (id) writeFromPlan(id) } },
    { id: 'write-chapter', label: t('Write this chapter from the plan (Claude)'), run: () => { const s = useStore.getState(); const c = s.book?.chapters.find(x => x.scenes.some(y => y.id === s.sceneId)); if (c) writeChapter(c.id) } },
    { id: 'export', label: t('Export…'), run: () => set({ dialog: 'export' }) },
    { id: 'snapshots', label: t('Snapshots'), run: () => set({ dialog: 'snapshots' }) },
    { id: 'find', label: t('Find and replace'), keys: 'Ctrl+Shift+F', run: () => set({ dialog: 'find' }) },
    { id: 'outline', label: t('Propose an outline'), run: () => set({ dialog: 'outline' }) },
    { id: 'zen', label: t('Distraction-free mode'), keys: 'F11', run: () => st.setPrefs({ zen: !st.prefs.zen }) },
    { id: 'dual', label: t('Bible beside the text'), run: () => st.setPrefs({ dual: st.prefs.dual === 'bible' ? null : 'bible' }) },
    { id: 'settings', label: t('Settings'), keys: 'Ctrl+,', run: () => set({ showSettings: true }) },
    { id: 'voice', label: t('Settings → Voice'), run: () => set({ showSettings: true, settingsTab: 'voice' }) },
    { id: 'claude', label: t('Settings → Claude'), run: () => set({ showSettings: true, settingsTab: 'claude' }) },
    { id: 'everything', label: t(st.prefs.simple ? 'Show everything' : 'Simpler view (hide the less used tabs)'), run: () => st.setPrefs({ simple: !st.prefs.simple }) },
    { id: 'help', label: t('Help'), keys: 'F1', run: () => set({ dialog: 'help' }) },
    { id: 'shortcuts', label: t('Keyboard shortcuts'), keys: 'Ctrl+/', run: () => set({ dialog: 'shortcuts' }) },
    { id: 'close', label: t('Close the book'), run: () => st.close() },
  ]
  return list
}
