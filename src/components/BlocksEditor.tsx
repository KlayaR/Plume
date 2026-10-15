// The full version of a bible entry as blocks, like cards in a stack: each has
// a title, a text and a switch for what the AI may read of it. Behind the
// scenes it is still one Markdown text with "### Heading" lines.
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { joinBlocks, parseBlocks, sendOf, type Send } from '../lib/blocks'
import { estimateTokens } from '../lib/text'
import { typeInfo, type Entry } from '../lib/types'
import { useStore } from '../store'
import { useT } from '../i18n'
import { showMenu } from '../contextMenu'

const SENDS: [Send, string][] = [['always', 'Always sent'], ['full', 'With the full entry'], ['never', 'Never sent']]

export default function BlocksEditor({ entry, update }: { entry: Entry; update: (patch: Partial<Entry>) => void }) {
  const lang = useStore(s => s.book!.meta.language)
  const t = useT()
  const [raw, setRaw] = useState(false)
  const [adding, setAdding] = useState('')
  // The blocks being edited keep their trailing spaces and line breaks; the entry's text is what is saved.
  const [blocks, setBlocks] = useState(() => parseBlocks(entry.full))
  useEffect(() => {
    if (joinBlocks(parseBlocks(joinBlocks(blocks))) !== joinBlocks(parseBlocks(entry.full))) setBlocks(parseBlocks(entry.full))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.full, entry.slug])
  const suggestions = typeInfo(entry.type).headings[lang].filter(h => !blocks.some(b => b.title === h))

  const save = (next: typeof blocks, sends = entry.sends) => { setBlocks(next); update({ full: joinBlocks(next), sends }) }
  const patch = (i: number, p: Partial<(typeof blocks)[number]>) => save(blocks.map((b, j) => j === i ? { ...b, ...p } : b))
  const rename = (i: number, title: string) => {
    const old = blocks[i].title
    const sends = { ...entry.sends }
    if (old in sends) { sends[title] = sends[old]; delete sends[old] }
    save(blocks.map((b, j) => j === i ? { ...b, title } : b), sends)
  }
  const setSend = (title: string, send: Send) => {
    const sends = { ...entry.sends }
    if (send === 'full') delete sends[title]; else sends[title] = send
    update({ sends })
  }
  const move = (i: number, d: number) => {
    const next = [...blocks]
    const [b] = next.splice(i, 1)
    next.splice(i + d, 0, b)
    save(next)
  }
  const add = (title: string) => {
    if (!title.trim() || blocks.some(b => b.title === title.trim())) return
    save([...blocks, { title: title.trim(), text: '' }])
    setAdding('')
  }

  if (raw) {
    return (
      <>
        <textarea className="sk-input pl-full" rows={14} value={entry.full} onChange={e => update({ full: e.target.value })} />
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setRaw(false)}>{t('Back to blocks')}</button>
      </>
    )
  }

  return (
    <div className="pl-blocks">
      {blocks.length === 0 && <span className="sk-hint">{t('No block yet. Add one below, such as Appearance or Secrets.')}</span>}
      {blocks.map((b, i) => (
        <div key={i} className={`pl-block pl-send-${sendOf(entry, b.title)}`} onContextMenu={e => showMenu(e, [
          { label: t('What the AI may read'), header: t('What the AI may read') },
          ...SENDS.map(([id, label]) => ({ label: t(label), checked: sendOf(entry, b.title) === id, onClick: () => setSend(b.title, id) })),
          { separator: true },
          { label: t('Move up'), disabled: i === 0, onClick: () => move(i, -1) },
          { label: t('Move down'), disabled: i === blocks.length - 1, onClick: () => move(i, 1) },
          { label: t('Duplicate'), onClick: () => save([...blocks.slice(0, i + 1), { title: `${b.title} (${t('copy')})`, text: b.text }, ...blocks.slice(i + 1)]) },
          { label: t('Delete'), danger: true, onClick: () => save(blocks.filter((_, j) => j !== i)) },
        ])}>
          <div className="pl-row">
            {b.title === '' && i === 0
              ? <span className="sk-label pl-grow">{t('Overview')}</span>
              : <input data-lt className="pl-block-title pl-grow" value={b.title} aria-label={t('Block title')} onChange={e => rename(i, e.target.value)} />}
            <span className="sk-hint">≈ {estimateTokens(b.text)}</span>
            <select className="sk-select sk-btn-sm" value={sendOf(entry, b.title)} aria-label={t('What the AI may read')} title={t('What the AI may read of this block')} onChange={e => setSend(b.title, e.target.value as Send)}>
              {SENDS.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
            </select>
            <button type="button" className="pl-quiet" aria-label={t('Move up')} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
            <button type="button" className="pl-quiet" aria-label={t('Move down')} disabled={i === blocks.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
            <button type="button" className="pl-quiet" aria-label={t('Delete')} onClick={() => save(blocks.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
          </div>
          <textarea className="sk-input" rows={Math.max(2, Math.min(10, b.text.split('\n').length + 1))} value={b.text} onChange={e => patch(i, { text: e.target.value })} />
        </div>
      ))}
      <div className="pl-row">
        <input className="sk-input pl-grow" list={`blk-${entry.slug}`} value={adding} placeholder={t('New block: Appearance, Secrets, History…')} onChange={e => setAdding(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(adding) }} />
        <datalist id={`blk-${entry.slug}`}>{suggestions.map(h => <option key={h} value={h} />)}</datalist>
        <button type="button" className="sk-btn sk-btn-sm" disabled={!adding.trim()} onClick={() => add(adding)}><Plus size={13} /> {t('Add block')}</button>
        <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => setRaw(true)} title={t('The same text with ### headings, to paste or edit in one go')}>{t('Edit as text')}</button>
      </div>
    </div>
  )
}
