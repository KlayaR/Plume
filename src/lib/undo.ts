// Undo and redo for the Plan and the Bible: each change leaves how to reverse it and
// how to do it again. Changes to the same thing in a burst (typing a name) are one step.
import type { BookMeta, Chapter, Scene } from './types'

export interface Step { key: string; name: string; at: number; undo: () => unknown; redo: () => unknown }

export function undoStack(limit = 60, burst = 30_000) {
  const done: Step[] = []
  const undone: Step[] = []
  let replaying = false
  const run = (f: () => unknown) => {
    replaying = true
    try { f() } finally { replaying = false }
  }
  const replay = (from: Step[], to: Step[], which: 'undo' | 'redo') => {
    const step = from.pop()
    if (!step) return null
    run(step[which])
    to.push(step)
    // What comes next is a new step, not more of the one on top.
    step.at = -Infinity
    if (done.length) done[done.length - 1].at = -Infinity
    return step
  }
  return {
    /** Remembers a change, unless it is one being undone or redone. An empty key never joins a burst. */
    push(key: string, name: string, undo: Step['undo'], redo: Step['redo'], now = Date.now()): Step | null {
      if (replaying) return null
      undone.length = 0
      const last = done[done.length - 1]
      if (key && last?.key === key && now - last.at < burst) { last.redo = redo; last.at = now; return last }
      const step = { key, name, at: now, undo, redo }
      done.push(step)
      if (done.length > limit) done.shift()
      return step
    },
    undo: () => replay(done, undone, 'undo'),
    redo: () => replay(undone, done, 'redo'),
    /** A toast's Undo button: this step, wherever it is now. */
    takeBack(step: Step | null) {
      const at = step ? done.indexOf(step) : -1
      if (at < 0) return
      done.splice(at, 1)
      run(step!.undo)
    },
    clear() { done.length = 0; undone.length = 0 },
  }
}

/** The keys of a patch that would change something, among the ones that count. */
export function changedKeys<T extends object>(obj: T, patch: Partial<T>, only?: readonly (keyof T)[]): (keyof T)[] {
  return (Object.keys(patch) as (keyof T)[]).filter(k => (!only || only.includes(k)) && obj[k] !== patch[k])
}

// What undo and snapshots treat as the plan: what you edit by hand, not the scene's
// text (the editor has its own undo) nor what Plume works out by itself.
export const SCENE_PLAN_KEYS: readonly (keyof Scene)[] = ['title', 'pov', 'status', 'note', 'time', 'place', 'lines', 'tension', 'beats', 'reveals', 'seeds', 'arc', 'pace', 'cast', 'locked']
export const CHAPTER_PLAN_KEYS: readonly (keyof Chapter)[] = ['title', 'kind', 'part', 'notes', 'goal', 'ending', 'hook', 'promise', 'arc']
export const META_PLAN_KEYS: readonly (keyof BookMeta)[] = ['structure', 'foundation', 'loose', 'arcs', 'threads', 'map']
