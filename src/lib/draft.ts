// Draft mode: a first draft that only goes forward, as on a typewriter. Typing lands at
// the end of the scene, the caret stays there, and only the word being written can be
// erased. Claude's proposals, capture lines and changes made elsewhere pass as usual.
import { Transaction, type TransactionSpec } from '@codemirror/state'

export type DraftBack = 'word' | 'none'

/** Where the word being written starts: everything before it is settled. */
export function wordStart(text: string): number {
  let at = text.length
  while (at > 0 && !/\s/.test(text[at - 1])) at--
  return at
}

const PASS = ['input.ai', 'input.review', 'delete.capture']

/** What draft mode makes of a change to the editor: as it is, moved to the end, or nothing. */
export function forwardOnly(tr: Transaction, back: DraftBack): TransactionSpec | readonly TransactionSpec[] {
  const end = tr.startState.doc.length
  if (!tr.docChanged) return tr.selection && !(tr.selection.main.empty && tr.selection.main.head === end) ? [tr, { selection: { anchor: end } }] : tr
  const event = tr.annotation(Transaction.userEvent)
  if (!event || PASS.includes(event)) return tr
  let from = end, to = 0, text = ''
  tr.changes.iterChanges((a, b, _c, _d, inserted) => { from = Math.min(from, a); to = Math.max(to, b); text += inserted.toString() })
  // Replacing what's just behind the caret is typography at work ("mot ?" gets its fine space).
  if (event.startsWith('input') && to === end) return tr
  if (/^input(\.type|\.paste|$)/.test(event)) return text ? { changes: { from: end, insert: text }, selection: { anchor: end + text.length }, scrollIntoView: true, userEvent: 'input.type' } : []
  if (event.startsWith('delete') && back === 'word' && to === end && from >= wordStart(tr.startState.doc.toString())) return tr
  return []
}
