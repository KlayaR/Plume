// Automatic updates: Plume reads latest.json from the `updater` GitHub release
// (written by the Release workflow) and installs a newer, signed version only
// when the writer clicks. On Windows the installer closes Plume and reopens it.
import { check, type Update } from '@tauri-apps/plugin-updater'
import { useStore } from './store'
import { t } from './i18n'

/** Saves pending edits first: the installer closes Plume without asking. */
export async function installUpdate(update: Update) {
  const st = useStore.getState()
  await st.flush()
  st.notify('ok', t('Downloading Plume {v}…', { v: update.version }))
  try { await update.downloadAndInstall() } catch (e) {
    useStore.getState().notify('error', t('The update failed: {e}', { e: String(e) }))
  }
}

/** A toast that stays until the writer installs or dismisses it. */
export function offerUpdate(update: Update) {
  useStore.setState({ toast: {
    kind: 'ok', sticky: true, msg: t('Plume {v} is available.', { v: update.version }),
    action: { label: t('Install and restart'), run: () => { installUpdate(update) } },
  } })
}

/** A few seconds after startup, unless turned off. Offline or no update stays silent. */
export function checkAtStartup() {
  if (!useStore.getState().prefs.autoUpdate) return
  setTimeout(() => { check().then(u => { if (u) offerUpdate(u) }).catch(() => {}) }, 5000)
}

export { check as checkForUpdate }
