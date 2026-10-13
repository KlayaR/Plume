// Plan: the book as cards, chapter by chapter. Editable cards, structure
// templates and story time arrive in 0.5.0; for now a card opens its scene.
import { useStore } from '../store'
import { chapterLabels } from '../lib/chapters'
import { countWords } from '../lib/text'
import { useT } from '../i18n'

const firstLine = (t: string) => t.split('\n').find(l => l.trim())?.trim() ?? ''

export default function PlanView() {
  const book = useStore(s => s.book)!
  const labels = chapterLabels(book.chapters, book.meta.language)
  const t = useT()
  return (
    <>
      <div className="pl-plan">
        <div className="pl-plan-intro">
          <span className="pl-label">{t('Every chapter and scene as a card; click one to write it')}</span>
          <span className="sk-hint">{t('Editable cards, structure templates, story time and story lines arrive in 0.5.0.')}</span>
        </div>
        {book.chapters.map((c, i) => (
          <section key={c.id} className="pl-plan-chapter">
            <div className="pl-plan-num">{c.kind === 'chapter' ? labels[i].number : labels[i].label}</div>
            <div className="pl-plan-cards">
              <div className="pl-plan-title">{c.title}</div>
              {c.scenes.map(s => (
                <button key={s.id} type="button" className="pl-card" onClick={() => useStore.getState().selectScene(s.id)}>
                  <span className="pl-card-head">
                    <span className={`pl-status pl-status-${s.status}`} />
                    <span className="pl-card-title">{s.title}</span>
                  </span>
                  <span className="pl-card-text">{firstLine(s.text).slice(0, 160) || '…'}</span>
                  <span className="pl-card-foot">{countWords(s.text)} {t('words')}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
