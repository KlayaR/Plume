// Which daily backups of a book to keep: the last ten always, then the newest of
// each week for half a year. Which old versions of a scene to keep: all of the last
// week, then the newest of each day for three months, then of each month.
// Pure, so it is tested; the native side only deletes.

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

/** Versions are named by their moment: 2026-11-10T12-30-00-000Z.md. */
const STAMP = /^(\d{4})-(\d{2})-(\d{2})T/

/** The old versions of one scene to remove, from their file names. Names that aren’t versions are left alone. */
export function versionsToRemove(names: string[], now = Date.now()): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const n of names.filter(x => STAMP.test(x)).sort().reverse()) {
    const [, y, m, d] = STAMP.exec(n)!
    const age = (now - Date.UTC(+y, +m - 1, +d)) / 864e5
    if (age < 7) continue
    // The newest of each day for three months, then of each month.
    const key = age < 90 ? `${y}-${m}-${d}` : `${y}-${m}`
    if (seen.has(key)) out.push(n)
    else seen.add(key)
  }
  return out
}
