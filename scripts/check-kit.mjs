// Verifies this app's vendored StudioKit copy (src/studio-kit/) before a build.
// - A file that differs from kit.lock.json was edited here: fail.
// - A newer ../StudioKit is available: warn only.
// - No ../StudioKit beside the app (e.g. a fresh clone): skip that comparison.
// This file is copied into each app by StudioKit's sync script.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Line endings are normalized so git's autocrlf checkout does not count as an edit.
export function hashContent(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex')
}

function newer(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

export function checkKit(appDir, { kitDir = resolve(appDir, '../StudioKit') } = {}) {
  const errors = []
  const warnings = []
  const vendorDir = join(appDir, 'src/studio-kit')
  const lockFile = join(vendorDir, 'kit.lock.json')
  if (!existsSync(lockFile)) {
    errors.push('src/studio-kit/kit.lock.json is missing. Run npm run sync-kit.')
    return { errors, warnings }
  }
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'))
  for (const [name, hash] of Object.entries(lock.files)) {
    const file = join(vendorDir, name)
    if (!existsSync(file) || hashContent(readFileSync(file, 'utf8')) !== hash) {
      errors.push(`studio-kit/${name} was edited in this app. Edit audio/StudioKit and run npm run sync-kit.`)
    }
  }
  const versionFile = join(kitDir, 'VERSION')
  if (existsSync(versionFile)) {
    const latest = readFileSync(versionFile, 'utf8').trim()
    if (newer(latest, lock.version)) {
      warnings.push(`StudioKit ${latest} is available (this app has ${lock.version}). Run npm run sync-kit to update.`)
    }
  }
  return { errors, warnings }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { errors, warnings } = checkKit(resolve(process.argv[2] ?? '.'))
  for (const w of warnings) console.warn(`warning: ${w}`)
  for (const e of errors) console.error(`error: ${e}`)
  process.exit(errors.length ? 1 : 0)
}
