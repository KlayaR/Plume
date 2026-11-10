// Which daily backups of a book to keep: the last ten always, then the newest of
// each week for half a year. Pure, so it is tested; the native side only deletes.

/** Backup files are named by their day: 2026-11-10.zip. */
const DAY = /^(\d{4})-(\d{2})-(\d{2})\.zip$/

/** The backups to remove, from the file names of one book's backups. Names that aren't backups are left alone. */
export function backupsToRemove(names: string[], keep = 10, weeks = 26): string[] {
  const days = names.filter(n => DAY.test(n)).sort().reverse()
  const out: string[] = []
  const weekOf = (n: string) => { const [, y, m, d] = DAY.exec(n)!; return Math.floor(Date.UTC(+y, +m - 1, +d) / 864e5 / 7) }
  const seen = new Set<number>()
  days.forEach((n, i) => {
    const w = weekOf(n)
    const first = !seen.has(w)
    seen.add(w)
    if (i < keep) return
    // Older than the last ten: one per week, the newest of it, for `weeks` weeks.
    if (first && seen.size <= weeks + 2) return
    out.push(n)
  })
  return out
}
