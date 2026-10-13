// Pictures in the book folder (portraits, the map): copied in from where the
// user picked them, shown as data URLs read through the native side.
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

const cache = new Map<string, string>()
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

/** Asks for a picture and copies it into the book as `<base>.<ext>`; returns its path in the book. */
export async function pickImage(root: string, base: string, title: string): Promise<string | null> {
  const src = await open({ title, filters: [{ name: 'Images', extensions: Object.keys(MIME) }] })
  if (typeof src !== 'string') return null
  const ext = (src.split('.').pop() ?? 'png').toLowerCase()
  const rel = `${base}.${MIME[ext] ? ext : 'png'}`
  await invoke('copy_into', { root, src, rel })
  cache.delete(`${root}|${rel}`)
  return rel
}

/** A picture of the book as a data URL, or '' while loading or if missing. */
export function useImage(root: string, rel: string | undefined): string {
  const key = `${root}|${rel}`
  const [url, setUrl] = useState(() => (rel ? cache.get(key) ?? '' : ''))
  useEffect(() => {
    if (!rel) { setUrl(''); return }
    if (cache.has(key)) { setUrl(cache.get(key)!); return }
    let off = false
    invoke<string>('read_base64', { root, rel }).then(b64 => {
      const u = `data:${MIME[(rel.split('.').pop() ?? '').toLowerCase()] ?? 'image/png'};base64,${b64}`
      cache.set(key, u)
      if (!off) setUrl(u)
    }).catch(() => { if (!off) setUrl('') })
    return () => { off = true }
  }, [key, rel, root])
  return url
}
