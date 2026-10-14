// Development only (vite dev with ?mock in the URL): stands in for the native
// side so the UI can be tried in a plain browser. An in-memory sample book and
// a fake `claude` that streams a canned reply. Never part of a release build.

const ROOT = 'C:\\Livres\\Le Bal des Cendres'
const files = new Map<string, string>()
const put = (rel: string, text: string) => files.set(rel, text)

put('plume.json', JSON.stringify({
  format: 1, title: 'Le Bal des Cendres', author: 'Test', language: 'fr',
  order: [{ folder: 'ch-le-bal', scenes: ['sc-l-arrivee.md', 'sc-la-danse.md'] }, { folder: 'ch-la-fuite', scenes: ['sc-la-nuit.md'] }],
}))
put('bible/style.md', '---\ntype: style\nname: Guide de style\ninclude: always\n---\n\n## Short\n\n## Full\n### Temps\nPassé simple, troisième personne.\n\n### Voix\nPhrases sobres, images sensorielles, peu d’adverbes.\n\n## Facts\n')
put('bible/characters/elise.md', '---\ntype: character\nname: Élise Varenne\naliases: [Élise, Lise, la Duchesse]\ninclude: auto\nlinks: [aube]\n---\n\n## Short\nJeune duchesse fière et imprudente, qui cache sa peur du feu.\n\n## Full\n### Apparence\nCheveux noirs, robe grise, une cicatrice au poignet.\n\n### Secrets\nElle a allumé l’incendie de Valombre, enfant.\n\n## Facts\n- [ch 1–2] Porte l’épée Aube sous sa cape.\n- [ch 5+] Aveugle de l’œil gauche.\n')
put('bible/objects/aube.md', '---\ntype: object\nname: Aube\ninclude: auto\n---\n\n## Short\nÉpée d’argent qui chauffe à l’approche de la magie.\n\n## Full\n\n## Facts\n')
put('bible/characters/marc.md', '---\ntype: character\nname: Marc Delorme\naliases: [Marc, le capitaine]\ninclude: auto\n---\n\n## Short\nCapitaine de la garde, loyal, amoureux d’Élise sans le dire.\n\n## Full\n\n## Facts\n')
put('bible/places/valombre.md', '---\ntype: place\nname: Valombre\ninclude: auto\n---\n\n## Short\nVille brûlée il y a quinze ans, encore en ruines au nord.\n\n## Full\n\n## Facts\n')
put('bible/lore/magie-du-feu.md', '---\ntype: lore\nname: La magie du feu\ninclude: always\n---\n\n## Short\nToute flamme magique coûte un souvenir à celui qui l’allume.\n\n## Full\n\n## Facts\n')
put('manuscript/ch-le-bal/chapter.md', '---\nid: c1\ntitle: Le bal\n---\n')
put('manuscript/ch-le-bal/sc-l-arrivee.md', '---\nid: s1\ntitle: L’arrivée\npov: elise\nstatus: revised\n---\n\nLa calèche s’arrêta devant les grilles. Élise resta un instant immobile, la main posée sur la garde d’Aube, cachée sous sa cape.\n\nMarc ouvrit la portière.\u00A0— Duchesse, on vous attend.\n\nElle descendit sans répondre. Au loin, vers le nord, les ruines de Valombre découpaient le ciel comme des dents noires.')
put('manuscript/ch-le-bal/sc-la-danse.md', '---\nid: s2\ntitle: La danse\npov: elise\nstatus: draft\n---\n\nLa musique commença quand Lise entra dans la salle.')
put('manuscript/ch-la-fuite/chapter.md', '---\nid: c2\ntitle: La fuite\n---\n')
put('manuscript/ch-la-fuite/sc-la-nuit.md', '---\nid: s3\ntitle: La nuit\nstatus: draft\n---\n\n')

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
      let i = 0
      const words = REPLY.split(/(?<= )/)
      const timer = setInterval(() => {
        if (i < words.length) {
          line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: words[i++] } } })
          return
        }
        clearInterval(timer)
        line({ type: 'rate_limit_event', rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.12, resetsAt: Date.now() / 1000 + 7200 }, seven_day: { utilization: 0.52, resetsAt: Date.now() / 1000 + 86400 * 3 } } } })
        line({ type: 'result', is_error: false, result: REPLY, usage: { input_tokens: 3, cache_creation_input_tokens: 420, cache_read_input_tokens: 1650, output_tokens: 61 } })
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
