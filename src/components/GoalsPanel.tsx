// Goals and momentum, opened from the bottom bar: today's words against the
// daily goal, the streak, the book's progress, word sprints and the last 30 days.
import { useEffect, useRef, useState } from 'react'
import { Flame, Target, Timer } from 'lucide-react'
import { useStore } from '../store'
import { bookWords, dailyWords, endSprint, startSprint, streak, todayWords, useSprint } from '../library'
import { numLocale, useT } from '../i18n'

const n = (x: number) => x.toLocaleString(numLocale())

export default function GoalsPanel() {
  const book = useStore(s => s.book)!
  const sprint = useSprint(s => s.sprint)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const box = useRef<HTMLSpanElement>(null)
  const t = useT()
  const today = todayWords(book)
  const daily = book.meta.goal.daily

  // The sprint's clock, and its end.
  useEffect(() => {
    if (!sprint || sprint.result !== null) return
    const timer = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= sprint.endsAt) endSprint()
    }, 1000)
    return () => clearInterval(timer)
  }, [sprint])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const running = !!sprint && sprint.result === null
  const left = running ? Math.max(0, sprint!.endsAt - now) : 0
  const clock = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`
  const days = dailyWords(book)
  const max = Math.max(daily, ...days.map(d => d.words), 1)
  const words = bookWords(book)

  return (
    <span className="pl-aa" ref={box}>
      <button type="button" className={`pl-quiet pl-goalbtn ${daily && today >= daily ? 'pl-goal-done' : ''}`} onClick={() => setOpen(o => !o)} title={t('Goals and momentum')}>
        {running ? <><Timer size={14} /> {clock}</> : <><Target size={14} /> {n(today)}{daily ? ` / ${n(daily)}` : ''}</>}
      </button>
      {open && (
        <div className="pl-pop pl-goals" role="dialog" aria-label={t('Goals and momentum')}>
          <div className="pl-row">
            <span className="sk-label pl-grow">{t('Today')}</span>
            <span className="sk-num">{n(today)} {daily ? `/ ${n(daily)}` : ''} {t('words')}</span>
          </div>
          {daily > 0 && <div className="pl-goalbar"><i style={{ width: `${Math.min(100, (today / daily) * 100)}%` }} /></div>}
          <div className="pl-row"><Flame size={14} className="pl-flame" /> <span>{t('{n} days in a row', { n: streak(book) })}</span></div>

          <div className="pl-row">
            <span className="sk-label pl-grow">{t('The book')}</span>
            <span className="sk-num">{n(words)}{book.meta.goal.book ? ` / ${n(book.meta.goal.book)}` : ''} {t('words')}</span>
          </div>
          {book.meta.goal.book > 0 && <div className="pl-goalbar"><i style={{ width: `${Math.min(100, (words / book.meta.goal.book) * 100)}%` }} /></div>}

          <span className="sk-label">{t('Last 30 days')}</span>
          <svg className="pl-days" viewBox="0 0 300 60" preserveAspectRatio="none">
            {daily > 0 && <line x1="0" x2="300" y1={60 - (daily / max) * 56} y2={60 - (daily / max) * 56} className="pl-days-goal" />}
            {days.map((d, i) => <rect key={d.day} x={i * 10 + 1} width="8" y={60 - (d.words / max) * 56} height={(d.words / max) * 56} className={daily && d.words >= daily ? 'pl-days-hit' : ''}><title>{`${d.day} : ${n(d.words)}`}</title></rect>)}
          </svg>

          <span className="sk-label">{t('Word sprint')}</span>
          {running ? (
            <div className="pl-row">
              <span className="sk-num pl-grow">{clock} · {n(words - sprint!.startWords)} {t('words')}</span>
              <button type="button" className="sk-btn sk-btn-sm" onClick={endSprint}>{t('Stop')}</button>
            </div>
          ) : (
            <div className="pl-row">
              {[10, 25, 45].map(m => <button key={m} type="button" className="sk-btn sk-btn-sm" onClick={() => { startSprint(m); setOpen(false) }}>{m} min</button>)}
              {sprint && sprint.result !== null && <span className="sk-hint">{t('Last: {n} words', { n: n(sprint.result) })}</span>}
            </div>
          )}
          <span className="sk-hint">{t('Goals are set in Settings → This book.')}</span>
        </div>
      )}
    </span>
  )
}
