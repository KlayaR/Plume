// Lists t('…') phrases in the source that have no French in src/i18n.ts.
// Exits with 1 when some are missing (run by `npm run check` and the CI).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src/', import.meta.url))
const i18n = readFileSync(join(root, 'i18n.ts'), 'utf8')
const fr = i18n.slice(i18n.indexOf('const FR'), i18n.indexOf('const SHELL'))
const keys = new Set()
for (const m of fr.matchAll(/'((?:[^'\\]|\\.)*)'\s*:/g)) keys.add(m[1].replace(/\\'/g, "'"))
for (const m of fr.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)) keys.add(m[1].replace(/\\"/g, '"'))

const files = []
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== 'studio-kit' && name !== 'dev') walk(p) }
    else if (/\.tsx?$/.test(name) && name !== 'i18n.ts' && !name.endsWith('.test.ts')) files.push(p)
  }
}
walk(root)

const missing = new Map()
const call = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(call)) {
    const k = (m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"')
    if (!keys.has(k) && !missing.has(k)) missing.set(k, relative(root, f))
  }
}
for (const [k, f] of missing) console.log(`${f}\t${k}`)
if (missing.size) { console.error(`${missing.size} phrase(s) without French in src/i18n.ts`); process.exit(1) }
console.log('French: every phrase translated.')
