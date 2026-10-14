// Signs one Windows file with SSL.com eSigner (Tauri's signCommand, see release.yml).
// Needs CODESIGNTOOL (path to CodeSignTool.bat) and ES_USERNAME, ES_PASSWORD,
// ES_TOTP_SECRET, plus ES_CREDENTIAL_ID if the account holds several certificates.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

const file = process.argv[2]
if (!file || !existsSync(file)) { console.error(`sign-windows: no file "${file}"`); process.exit(1) }
const env = process.env
const out = mkdtempSync(join(tmpdir(), 'plume-sign-'))
const args = [
  'sign',
  `-username=${env.ES_USERNAME}`,
  `-password=${env.ES_PASSWORD}`,
  `-totp_secret=${env.ES_TOTP_SECRET}`,
  `-input_file_path=${file}`,
  `-output_dir_path=${out}`,
]
if (env.ES_CREDENTIAL_ID) args.push(`-credential_id=${env.ES_CREDENTIAL_ID}`)

// A .bat runs through cmd: quoting each argument keeps & ^ | < > in secrets literal
// (a secret must not contain " or %). CodeSignTool can exit 0 after an error, so
// success means a signed copy in `out`.
const line = [env.CODESIGNTOOL, ...args].map(a => `"${a}"`).join(' ')
const log = execFileSync('cmd.exe', ['/d', '/s', '/c', `"${line}"`],
  { cwd: dirname(env.CODESIGNTOOL), encoding: 'utf8', windowsVerbatimArguments: true })
const signed = join(out, basename(file))
if (!existsSync(signed)) { console.error(log); process.exit(1) }
copyFileSync(signed, file)
rmSync(out, { recursive: true, force: true })
console.log(`Signed ${basename(file)}`)
