// F1: how to use Plume, by topic, with a search box. Text is in lib/help.ts.
import { useMemo, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { Dialog } from '../studio-kit/shell.js'
import { useStore } from '../store'
import { searchHelp } from '../lib/help'
import { useT } from '../i18n'

/** **bold** and `code` in a help line. */
function Line({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part)}</>
}

export default function HelpDialog({ onClose }: { onClose: () => void }) {
  const ui = useStore(s => s.prefs.ui)
  const t = useT()
  const [query, setQuery] = useState('')
  const topics = useMemo(() => searchHelp(query, ui), [query, ui])
  return (
    <Dialog wide title={t('Help')} icon={CircleHelp} onClose={onClose}
      footer={<>
        <button type="button" className="sk-btn sk-btn-ghost" onClick={() => { onClose(); useStore.setState({ dialog: 'tour' }) }}>{t('Quick tour')}</button>
        <button type="button" className="sk-btn sk-btn-ghost" onClick={() => { onClose(); useStore.setState({ dialog: 'shortcuts' }) }}>{t('Keyboard shortcuts')}</button>
        <button type="button" className="sk-btn sk-btn-primary" onClick={onClose}>{t('Close')}</button>
      </>}>
      <div className="pl-help">
        <input className="sk-input" autoFocus value={query} placeholder={t('Search the help: proposal, secret, export…')} onChange={e => setQuery(e.target.value)} />
        {topics.length === 0 && <span className="sk-hint">{t('Nothing matches.')}</span>}
        {topics.map(h => (
          <section key={h.id} className="pl-help-topic">
            <h3>{h.title[ui]}</h3>
            <ul>{h.lines[ui].map((l, i) => <li key={i}><Line text={l} /></li>)}</ul>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
