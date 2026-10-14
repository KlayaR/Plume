// Writes latest.json, the file installed copies of Plume read to find a new
// version: node scripts/updater-manifest.mjs <version> <notes file> > latest.json
// Needs the signed installer (.exe + .exe.sig) from a release build.
import { readFileSync, readdirSync } from 'node:fs'

const [version, notesFile] = process.argv.slice(2)
const conf = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
if (!conf.plugins?.updater?.pubkey || conf.plugins.updater.pubkey.startsWith('PASTE')) {
  console.error('tauri.conf.json has no updater public key (plugins.updater.pubkey).')
  process.exit(1)
}
const dir = new URL('../src-tauri/target/release/bundle/nsis/', import.meta.url)
const sig = readdirSync(dir).find(f => f.endsWith('.exe.sig') && f.includes(`_${version}_`))
if (!sig) { console.error(`No signed installer for ${version} in ${dir.pathname}`); process.exit(1) }
const exe = sig.slice(0, -'.sig'.length)

console.log(JSON.stringify({
  version,
  notes: notesFile ? readFileSync(notesFile, 'utf8').trim() : '',
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: readFileSync(new URL(sig, dir), 'utf8').trim(),
      url: `https://github.com/KlayaR/Plume/releases/download/v${version}/${encodeURIComponent(exe)}`,
    },
  },
}, null, 2))
