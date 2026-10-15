// Development only (vite dev with ?mock in the URL): stands in for the native
// side so the UI can be tried in a plain browser. An in-memory sample book and
// a fake `claude` that streams a canned reply. Never part of a release build.

import { exampleFiles } from '../lib/example'

const ROOT = 'C:\\Livres\\Le Bal des Cendres'
const files = new Map<string, string>()
const put = (rel: string, text: string) => files.set(rel, text)

// The sample book is the example book offered in New book.
for (const [rel, text] of Object.entries(exampleFiles('fr'))) put(rel, text)

const REPLY = 'Les lustres tremblaient au rythme des violons. Elle sentit la chaleur d\'Aube contre sa hanche, comme un avertissement... "Pas ce soir", murmura-t-elle. Marc, de l\'autre côté de la salle, ne la quittait pas des yeux !'

type Cb = (e: unknown) => void
const callbacks = new Map<number, Cb>()
const listeners = new Map<string, number[]>()
let next = 1

const emit = (event: string, payload: unknown) => {
  for (const id of listeners.get(event) ?? []) callbacks.get(id)?.({ event, id, payload })
}

const rel = (args: any) => String(args.rel ?? '')

async function invoke(cmd: string, args: any = {}): Promise<unknown> {
  switch (cmd) {
    case 'plugin:event|listen': {
      const list = listeners.get(args.event) ?? []
      list.push(args.handler)
      listeners.set(args.event, list)
      return next++
    }
    case 'plugin:event|unlisten': return null
    case 'plugin:app|version': return '0.1.0-mock'
    case 'plugin:path|resolve_directory': return 'C:\\Users\\Test\\Documents'
    case 'plugin:path|join': return (args.paths as string[]).join('\\')
    case 'plugin:dialog|ask': return true
    // ask() goes through the message command and compares the answer with its OK label.
    case 'plugin:dialog|message': return 'Yes'
    case 'plugin:dialog|open': return ROOT
    case 'read_text': {
      const t = files.get(rel(args))
      if (t === undefined) throw `${rel(args)}: not found`
      return t
    }
    case 'write_text': files.set(rel(args), args.content); return null
    case 'path_exists': return args.root === ROOT && (rel(args) === '' || rel(args) === 'plume.json' || files.has(rel(args)))
    case 'list_files': return [...files.keys()].filter(k => k.startsWith(rel(args) + '/') && k.endsWith('.md')).sort()
    case 'move_to_trash': files.delete(rel(args)); return null
    case 'find_claude': return 'C:\\Users\\Test\\.local\\bin\\claude.exe'
    case 'run_claude': {
      const id = args.id
      const line = (o: unknown) => emit('claude-line', { id, line: JSON.stringify(o) })
      ;(window as any).__lastClaude = { system: args.system, message: args.message, model: args.model, effort: args.effort }
      // window.__mockLimit = true: the plan is used up (to try the OpenRouter fallback).
      if ((window as any).__mockLimit) {
        setTimeout(() => { line({ type: 'result', is_error: true, result: 'Usage limit reached: resets at 5pm' }); emit('claude-done', { id, code: 1, stderr: '' }) }, 80)
        return null
      }
      let i = 0
      // window.__mockReply: what the fake claude answers next (an outline's JSON, say); otherwise the canned prose.
      const reply = (window as any).__mockReply ?? REPLY
      const words = reply.split(/(?<= )/)
      const timer = setInterval(() => {
        if (i < words.length) {
          line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: words[i++] } } })
          return
        }
        clearInterval(timer)
        line({ type: 'rate_limit_event', rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.12, resetsAt: Date.now() / 1000 + 7200 }, seven_day: { utilization: 0.52, resetsAt: Date.now() / 1000 + 86400 * 3 } } } })
        line({ type: 'result', is_error: false, result: reply, usage: { input_tokens: 3, cache_creation_input_tokens: 420, cache_read_input_tokens: 1650, output_tokens: 61 } })
        emit('claude-done', { id, code: 0, stderr: '' })
      }, 60)
      return null
    }
    case 'cancel_claude': return null
    case 'app_read': { const v = (window as any).__appFiles?.[args.name]; if (v === undefined) throw 'not found'; return v }
    case 'app_write': (window as any).__appFiles = { ...((window as any).__appFiles ?? {}), [args.name]: args.content }; return null
    // A 2×2 grey picture stands in for every image of the book.
    case 'read_base64': return 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mN89+7dfwYGBgYmBhgAAGWfBCWuH5WgAAAAAElFTkSuQmCC'
    case 'copy_into': files.set(rel(args), '(image)'); return null
    case 'read_file_base64': return (window as any).__importFile ?? ''
    case 'write_file_base64': (window as any).__exports = { ...((window as any).__exports ?? {}), [args.path]: args.data }; return null
    case 'list_all': return [...files.keys()].filter(k => !k.startsWith('.plume/'))
    case 'write_backup': (window as any).__backup = args; return `C:\\Users\\Test\\AppData\\Local\\Plume\\backups\\${args.name}\\${args.date}.zip`
    case 'list_backups': return (window as any).__backup ? ['C:\\backups\\today.zip'] : []
    case 'file_mtime': return 0
    case 'device_name': return 'MOCK-PC'
    case 'plugin:dialog|save': return 'C:\\Users\\Test\\Export'
    default:
      return null // window theme and other plugin calls
  }
}

;(window as any).__TAURI_INTERNALS__ = {
  invoke,
  transformCallback: (cb: Cb) => { const id = next++; callbacks.set(id, cb); return id },
  unregisterCallback: (id: number) => callbacks.delete(id),
  metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
  convertFileSrc: (p: string) => p,
}
;(window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
;(window as any).__mockFiles = files

export {}
