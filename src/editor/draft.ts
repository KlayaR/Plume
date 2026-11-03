// Draft mode's switch, its place in the editor and the typewriter sounds. What it
// lets through is decided in lib/draft.ts.
import { EditorState, Transaction } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { create } from 'zustand'
import { forwardOnly } from '../lib/draft'
import { useStore } from '../store'
import { getEditorView } from './actions'

export const useDraft = create<{ on: boolean }>(() => ({ on: false }))

export function startDraft() {
  const st = useStore.getState()
  if (st.prefs.page) st.setPrefs({ page: false })
  if (st.view !== 'manuscript') st.setView('manuscript')
  useDraft.setState({ on: true })
  const v = getEditorView()
  if (v?.dom.isConnected) { v.focus(); v.dispatch({ selection: { anchor: v.state.doc.length }, scrollIntoView: true }) }
}
export const leaveDraft = () => useDraft.setState({ on: false })
export const toggleDraft = () => useDraft.getState().on ? leaveDraft() : startDraft()

// Another book, or none: the draft is over.
useStore.subscribe((s, old) => { if (s.book?.root !== old.book?.root) leaveDraft() })

let audio: AudioContext | undefined

/** A key: a very short burst of filtered noise, never twice quite the same. */
function keySound(ctx: AudioContext) {
  const size = Math.floor(ctx.sampleRate * 0.035)
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size) ** 3
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const tone = ctx.createBiquadFilter()
  tone.type = 'bandpass'
  tone.frequency.value = 1400 + Math.random() * 800
  const gain = ctx.createGain()
  gain.gain.value = 0.5
  source.connect(tone).connect(gain).connect(ctx.destination)
  source.start()
}

function bell(ctx: AudioContext) {
  const tone = ctx.createOscillator()
  const gain = ctx.createGain()
  const now = ctx.currentTime
  tone.frequency.value = 1900
  gain.gain.setValueAtTime(0.12, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
  tone.connect(gain).connect(ctx.destination)
  tone.start(now)
  tone.stop(now + 0.6)
}

const sounds = EditorView.updateListener.of(u => {
  if (!u.docChanged || !useDraft.getState().on || !useStore.getState().prefs.draftSound) return
  for (const tr of u.transactions) {
    const event = tr.annotation(Transaction.userEvent)
    if (!event || !/^(input$|input\.type|delete\.(backward|forward))/.test(event)) continue
    let text = ''
    tr.changes.iterChanges((_a, _b, _c, _d, inserted) => { text += inserted.toString() })
    audio ??= new AudioContext()
    if (text.includes('\n')) bell(audio)
    else keySound(audio)
  }
})

// History goes round transaction filters, so undo is stopped at the key. The autocorrect's own Ctrl+Z comes first.
const noHistory = ['Mod-z', 'Mod-y', 'Mod-Shift-z', 'Mod-u', 'Alt-u'].map(key => ({ key, run: () => useDraft.getState().on }))

export const draftExt = [
  EditorState.transactionFilter.of(tr => useDraft.getState().on ? forwardOnly(tr, useStore.getState().prefs.draftBack) : tr),
  keymap.of([{ key: 'Escape', run: () => { if (!useDraft.getState().on) return false; leaveDraft(); return true } }, ...noHistory]),
  sounds,
]
