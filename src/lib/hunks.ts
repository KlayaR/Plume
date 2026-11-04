// A word-by-word comparison as changes to place in the text. Changes separated
// only by a space or one short word become one, so a rewrite doesn't read as confetti.
export interface DiffLike { kind: 'same' | 'add' | 'del'; text: string }
export interface Hunk { from: number; to: number; insert: string }

const isBridge = (s: string) => !s.includes('\n') && s.trim().length <= 3

export function hunksOf(parts: DiffLike[], start = 0): Hunk[] {
  const out: Hunk[] = []
  let at = start
  let open: Hunk | null = null
  let deleted = ''
  // A space that only became a non-breaking one isn't worth a decision.
  const close = () => { if (open && (open.insert.trim() || deleted.trim())) out.push(open); open = null; deleted = '' }
  parts.forEach((p, i) => {
    if (p.kind === 'same') {
      // Between two changes, a small unchanged piece goes inside the change.
      if (open && i < parts.length - 1 && isBridge(p.text)) { open.to += p.text.length; open.insert += p.text; deleted += p.text }
      else close()
      at += p.text.length
      return
    }
    open ??= { from: at, to: at, insert: '' }
    if (p.kind === 'del') { at += p.text.length; open.to = at; deleted += p.text } else open.insert += p.text
  })
  close()
  return out
}
