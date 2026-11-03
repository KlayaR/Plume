// A scene the plan knows and the text doesn't yet, in its place in the manuscript:
// what it is meant to hold, and Claude's button. Never part of the text or of a page.
import { PenLine } from 'lucide-react'
import type { Scene } from '../lib/types'
import { useT } from '../i18n'
import { useAI, writeFromPlan } from '../editor/actions'

export default function Unwritten({ scene, page, named, onOpen }: { scene: Scene; page?: boolean; named?: boolean; onOpen?: () => void }) {
  const t = useT()
  const busy = useAI(s => !!s.running || s.hasProposal)
  const empty = !scene.text.trim()
  if (!empty && !scene.beats?.length) return null
  return (
    <div className={`pl-unwritten ${page ? 'pl-unwritten-page' : ''}`} data-unwritten={scene.id} onDoubleClick={onOpen}>
      <div className="pl-grow">
        {named && <div className="pl-unwritten-title">{scene.title}</div>}
        {/* On the sheet the note is the text's own placeholder. */}
        {page && scene.note?.trim() && <div className="pl-unwritten-note">{scene.note.trim()}</div>}
        {!!scene.beats?.length && <ul>{scene.beats.map((b, i) => <li key={i}>{b}</li>)}</ul>}
      </div>
      {empty && (
        <div className="pl-unwritten-side">
          <span>{t('Not written yet')}</span>
          <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" disabled={busy} title={t('Write it from the plan (Claude)')} onClick={() => writeFromPlan(scene.id)}><PenLine size={13} /> {t('Write it')}</button>
        </div>
      )}
    </div>
  )
}
