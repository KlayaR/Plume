// The store's save queue, against a fake native side: what is waiting is written
// before a book closes, and a failed write keeps the book open until you decide.
import { beforeAll, describe, expect, it } from 'vitest'
import type { Book, Scene } from './lib/types'
import { DEFAULT_AI, DEFAULT_VOICE } from './lib/types'

const written = new Map<string, string>()
let failOn: string | null = null

beforeAll(() => {
  ;(globalThis as any).window = {
    __TAURI_INTERNALS__: {
      invoke: async (cmd: string, args: any = {}) => {
        if (cmd === 'write_text') {
          if (failOn && args.rel === failOn) throw new Error('Access denied')
          written.set(args.rel, args.content)
          return null
        }
        if (cmd === 'read_text') throw new Error('not found')
        if (cmd === 'plugin:dialog|message' || cmd === 'plugin:dialog|ask') return false
        return cmd === 'file_mtime' ? 0 : null
      },
      transformCallback: () => 0,
    },
  }
})

const scene = (id: string): Scene => ({ id, path: `manuscript/c/${id}.md`, title: id, pov: null, status: 'draft', text: '', extra: {} })
const book = (): Book => ({
  root: 'C:\\Books\\T',
  meta: { format: 1, title: 'T', author: '', language: 'en', order: [], ai: { ...DEFAULT_AI }, voice: DEFAULT_VOICE, structure: { template: '', beats: [] }, loose: [], history: {}, goal: { book: 0, daily: 0 }, series: null, map: null, ignored: [] },
  entries: [],
  chapters: [{ id: 'c', folder: 'c', kind: 'chapter', title: 'One', notes: '', scenes: [scene('a'), scene('b')] }],
})

describe('save queue', () => {
  it('writes every waiting change before the book closes', async () => {
    const { useStore } = await import('./store')
    useStore.getState().setBook(book())
    useStore.getState().updateScene('a', { text: 'First scene.' })
    useStore.getState().updateScene('b', { text: 'Second scene.' })
    useStore.getState().updateChapter('c', { title: 'Renamed' })
    await useStore.getState().close()
    expect(written.get('manuscript/c/a.md')).toContain('First scene.')
    expect(written.get('manuscript/c/b.md')).toContain('Second scene.')
    expect(written.get('manuscript/c/chapter.md')).toContain('Renamed')
    expect(useStore.getState().book).toBe(null)
  })
  it('keeps the book open when a write fails and you choose not to lose it', async () => {
    const { useStore } = await import('./store')
    useStore.getState().setBook(book())
    failOn = 'manuscript/c/a.md'
    useStore.getState().updateScene('a', { text: 'Will not save.' })
    await useStore.getState().close()
    expect(useStore.getState().book).not.toBe(null)
    expect(useStore.getState().saving).toBe('error')
    failOn = null
    expect(await useStore.getState().flush()).toBe(true)
    expect(written.get('manuscript/c/a.md')).toContain('Will not save.')
  })
})

describe('JSON replies from the command line', () => {
  it('takes the wrapper off a list and off an object, and reads insides that came as text', async () => {
    const { unwrap } = await import('./ai')
    expect(unwrap('{"items":[{"a":1}]}', 'list')).toBe('[{"a":1}]')
    expect(unwrap('{"value":{"letter":"Hi","continuity":[{"title":"t"}]}}', 'object')).toBe('{"letter":"Hi","continuity":[{"title":"t"}]}')
    // The command line sometimes sends a list inside as a string of JSON.
    expect(JSON.parse(unwrap('{"value":{"letter":"Hi","continuity":"[{\\"title\\": \\"t\\"}]"}}', 'object'))).toEqual({ letter: 'Hi', continuity: [{ title: 't' }] })
    // OpenRouter and older replies come without a wrapper: left as they are.
    expect(unwrap('[{"a":1}]', 'list')).toBe('[{"a":1}]')
    expect(unwrap('{"goal":"g","scenes":[]}', 'object')).toBe('{"goal":"g","scenes":[]}')
    expect(unwrap('plain prose', undefined)).toBe('plain prose')
  })
})
