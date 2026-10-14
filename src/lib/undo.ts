// Undo in the Plan and the Bible: each move, deletion or rename leaves the step that reverses it.

/** `run` reverses the step; it may return another message when it could not (or only partly). */
export interface UndoStep { done: string; run: () => string | void }

export class UndoStack {
  private steps: UndoStep[] = []
  private undoing = false
  constructor(private max = 40) {}

  /** Remembers how to reverse what was just done; steps taken while undoing are not remembered. */
  push(done: string, run: UndoStep['run']): UndoStep | null {
    if (this.undoing) return null
    const step = { done, run }
    this.steps.push(step)
    if (this.steps.length > this.max) this.steps.shift()
    return step
  }

  /** Reverses the last step, or a given one (a toast's Undo button); returns what was undone, or null. */
  undo(step?: UndoStep | null): string | null {
    const i = step ? this.steps.lastIndexOf(step) : this.steps.length - 1
    if (i < 0) return null
    const [s] = this.steps.splice(i, 1)
    this.undoing = true
    try { return s.run() || s.done } finally { this.undoing = false }
  }

  /** Forgets every step: another book is open. */
  clear() { this.steps = [] }
}
