import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'

/** The app version from tauri.conf.json. Empty outside Tauri (browser preview). */
export function useAppVersion(): string {
  const [version, setVersion] = useState('')
  useEffect(() => { getVersion().then(setVersion).catch(() => {}) }, [])
  return version
}
