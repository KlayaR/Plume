// The version must be the same in package.json, tauri.conf.json and Cargo.toml,
// and CHANGELOG.md must have a section for it.
import { readFileSync } from 'node:fs'

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const pkg = JSON.parse(read('package.json')).version
const tauri = JSON.parse(read('src-tauri/tauri.conf.json')).version
const cargo = /^version\s*=\s*"([^"]+)"/m.exec(read('src-tauri/Cargo.toml'))?.[1]
const problems = []
if (tauri !== pkg) problems.push(`tauri.conf.json says ${tauri}, package.json ${pkg}`)
if (cargo !== pkg) problems.push(`Cargo.toml says ${cargo}, package.json ${pkg}`)
if (!new RegExp(`^## ${pkg.replace(/\./g, '\\.')}\\b`, 'm').test(read('CHANGELOG.md'))) problems.push(`CHANGELOG.md has no "## ${pkg}" section`)
if (problems.length) { for (const p of problems) console.error(p); process.exit(1) }
console.log(`Version ${pkg}: the same everywhere, with a changelog section.`)
