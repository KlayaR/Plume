// npm run release: builds the Windows installer on this computer and publishes
// the GitHub release for the version in package.json, with that version's
// CHANGELOG.md section as notes. Stops if anything is uncommitted or failing.
//   --dry       do everything except publish
//   --replace   the release already exists: swap its installer for the new one
import { spawnSync } from 'node:child_process'
import { existsSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dry = process.argv.includes('--dry')
const replace = process.argv.includes('--replace')

const die = msg => { console.error(`\nrelease: ${msg}`); process.exit(1) }
const sh = (cmd, { quiet = false } = {}) => spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8', stdio: quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'] })
const out = cmd => (sh(cmd, { quiet: true }).stdout ?? '').trim()
const must = (cmd, what) => { console.log(`\n> ${what}`); if (sh(cmd).status !== 0) die(`${what} failed.`) }

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const tag = `v${version}`

if (out('git status --porcelain')) die('there are uncommitted changes. Commit them first, so the installer matches what is on GitHub.')
if (out('git rev-parse --abbrev-ref HEAD') !== 'main') die('switch to the main branch first.')
sh('git fetch origin', { quiet: true })
if (Number(out('git rev-list --count HEAD..origin/main')) > 0) die('GitHub has newer commits. Run git pull first.')
if (Number(out('git rev-list --count origin/main..HEAD')) > 0) must('git push origin main', 'Pushing your commits')

const exists = sh(`gh release view ${tag}`, { quiet: true }).status === 0
if (exists && !replace) die(`the release ${tag} already exists. Bump the version, or run with --replace to swap its installer.`)

const started = Date.now()
must('npm test', 'Tests')
must('npm run check', 'Checks (French, versions, changelog)')
must('npm run build', `Building the installer for ${version}`)

const exe = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis', `Plume_${version}_x64-setup.exe`)
if (!existsSync(exe) || statSync(exe).mtimeMs < started) die(`the build did not produce a fresh ${exe}.`)
const mb = (statSync(exe).size / 1048576).toFixed(1)
console.log(`\nInstaller ready: ${exe} (${mb} MB)`)

const notesFile = join(tmpdir(), `plume-notes-${version}.md`)
const notes = out(`node scripts/release-notes.mjs ${version}`)
if (!notes) die(`no CHANGELOG.md section for ${version}.`)
writeFileSync(notesFile, notes)

if (dry) { console.log('\nDry run: nothing published.'); process.exit(0) }

const quoted = `"${exe}"`
if (exists) must(`gh release upload ${tag} ${quoted} --clobber`, `Replacing the installer of ${tag}`)
else {
  const sha = out('git rev-parse HEAD')
  const pre = version.startsWith('0.') ? ' --prerelease' : ''
  must(`gh release create ${tag} ${quoted} --target ${sha}${pre} --title "Plume ${version}" --notes-file "${notesFile}"`, `Publishing ${tag}`)
}
console.log(`\nDone: ${out(`gh release view ${tag} --json url --jq .url`)}`)
