// Prints one version's section of CHANGELOG.md (for the GitHub release).
import { readFileSync } from 'node:fs'

const version = process.argv[2]
const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split('\n')
const start = lines.findIndex(l => new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b`).test(l))
if (start < 0) { console.error(`No "## ${version}" section in CHANGELOG.md`); process.exit(1) }
const end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
console.log(lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim())
