// Rephrase: several rewordings of the selected passage (or of a flagged sentence), to
// pick from. They keep what the passage says, in your voice; a mode asks for shorter,
// longer, more fluent, more or less formal, more sensory, tenser or plainer. Clicking
// one puts it in the text (Ctrl+Z brings the old one back).
import { useEffect, useState } from 'react'
import { PenLine } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { REPHRASE_MODES, rephrase, rephraseTarget, type RephraseMode } from '../editor/actions'
import { fixTypography } from '../lib/typography'
import { useT } from '../i18n'

export default function RephraseDialog({ onClose }: { onClose: () => void }) {
  const book = useStore(s => s.book)!
  const t = useT()
  const [target] = useState(rephraseTarget)
  const [mode, setMode] = useState<RephraseMode>('fluent')
  const [list, setList] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const original = target ? target.view.state.sliceDoc(target.from, target.to) : ''

  const run = async (m: RephraseMode) => {
    if (!target || busy) return
    setMode(m); setBusy(true); setList([])
    try { setList(await rephrase(target, m)) }
    catch (e) { useStore.getState().notify('error', (e as Error).message) }
    setBusy(false)
  }
  // The first list comes at once, in the neutral mode.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run('fluent') }, [])

  const pick = (text: string) => {
    if (!target) return
    const insert = fixTypography(text, book.meta.language)
    target.view.dispatch({ changes: { from: target.from, to: target.to, insert }, selection: { anchor: target.from, head: target.from + insert.length }, scrollIntoView: true })
    target.view.focus()
    onClose()
  }

  return (
    <Dialog wide title={t('Rephrase')} icon={PenLine} onClose={onClose} footer={<button type="button" className="sk-btn sk-btn-ghost" onClick={onClose}>{t('Close')}</button>}>
      {!target ? <p className="sk-hint">{t('Select a sentence or a passage first.')}</p> : (
        <div className="pl-find">
          <q className="pl-edit-quote">{original}</q>
          <div className="pl-chips" role="group" aria-label={t('How to rephrase')}>
            {REPHRASE_MODES.map(m => <button key={m.id} type="button" className={`pl-chip ${mode === m.id ? 'pl-chip-on' : ''}`} disabled={busy} onClick={() => run(m.id)}>{t(m.label)}</button>)}
          </div>
          {busy && <p className="sk-hint">{t('Claude is rewording it…')}</p>}
          {!busy && !list.length && <p className="sk-hint">{t('No rewording came back. Try another way.')}</p>}
          <div className="pl-rephrase">
            {list.map((x, i) => <button key={i} type="button" className="pl-rephrase-item" title={t('Put this one in the text')} onClick={() => pick(x)}>{x}</button>)}
          </div>
          {list.length > 0 && <span className="sk-hint">{t('Click one to put it in the text; Ctrl+Z brings the old one back. Each list is one request to Claude.')}</span>}
        </div>
      )}
    </Dialog>
  )
}
