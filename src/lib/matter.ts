// Front and back matter, and part pages: what a published book carries around
// its chapters. Written once in Settings -> This book, printed by every export.
import type { Book, Lang, MatterKey } from './types'

export const FRONT: MatterKey[] = ['copyright', 'dedication', 'epigraph']
export const BACK: MatterKey[] = ['acknowledgments', 'about']

export const MATTER_LABEL: Record<MatterKey, Record<Lang, string>> = {
  copyright: { en: 'Copyright page', fr: 'Page de copyright' },
  dedication: { en: 'Dedication', fr: 'Dédicace' },
  epigraph: { en: 'Epigraph', fr: 'Épigraphe' },
  acknowledgments: { en: 'Acknowledgments', fr: 'Remerciements' },
  about: { en: 'About the author', fr: 'À propos de l’auteur' },
}

/** Back matter has a heading in print; the front matter pages stand without one. */
export const HEADED: Record<MatterKey, boolean> = { copyright: false, dedication: false, epigraph: false, acknowledgments: true, about: true }

export interface MatterPage { key: MatterKey; heading: string; paras: string[] }

/** The filled-in pages, front or back, as paragraphs. */
export function matterPages(book: Book, keys: MatterKey[]): MatterPage[] {
  const lang = book.meta.language
  return keys.flatMap(key => {
    const paras = (book.meta.matter?.[key] ?? '').split('\n').map(p => p.trim()).filter(Boolean)
    return paras.length ? [{ key, heading: HEADED[key] ? MATTER_LABEL[key][lang] : '', paras }] : []
  })
}
