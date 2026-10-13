// Chapter numbering: a prologue and an epilogue step out of the count.
import type { Chapter, Lang } from './types'

export interface ChapterLabel { number: number; label: string }

export function chapterLabels(chapters: Pick<Chapter, 'kind'>[], lang: Lang): ChapterLabel[] {
  let n = 0
  return chapters.map(c => {
    if (c.kind === 'prologue') return { number: 0, label: 'Prologue' }
    if (c.kind === 'epilogue') return { number: n + 1, label: lang === 'fr' ? 'Épilogue' : 'Epilogue' }
    n++
    return { number: n, label: `${lang === 'fr' ? 'Chapitre' : 'Chapter'} ${n}` }
  })
}

/** Only the first chapter can be a prologue, only the last an epilogue. */
export function allowedKinds(index: number, count: number): Chapter['kind'][] {
  const kinds: Chapter['kind'][] = ['chapter']
  if (index === 0) kinds.push('prologue')
  if (index === count - 1 && count > 1) kinds.push('epilogue')
  return kinds
}

/**
 * Enter at the very end of a scene, on an empty last line, starts a new scene.
 * `doc` is the text before the key press, `pos` the cursor.
 */
export function enterStartsScene(doc: string, pos: number): boolean {
  if (pos !== doc.length || !doc.trim()) return false
  const lastLine = doc.slice(doc.lastIndexOf('\n') + 1)
  return doc.includes('\n') && lastLine.trim() === ''
}
