// Review side of the Manuscript: numbers about the scene, its chapter and the
// book, computed locally (zero tokens). More checks come in 0.7.0.
import { useMemo } from 'react'
import { findScene, useStore } from '../store'
import { textStats, type TextStats } from '../lib/stats'
import { numLocale, useT } from '../i18n'

const n = (x: number, d = 0) => x.toLocaleString(numLocale(), { maximumFractionDigits: d, minimumFractionDigits: d })

function Rows({ s }: { s: TextStats }) {
  const t = useT()
  return (
    <dl className="pl-stats">
      <dt>{t('Words')}</dt><dd className="sk-num">{n(s.words)}</dd>
      <dt>{t('Signs')}</dt><dd className="sk-num">{n(s.signs)}</dd>
      <dt>{t('Feuillets (1 500 signs)')}</dt><dd className="sk-num">{n(s.feuillets, 1)}</dd>
      <dt>{t('Paragraphs')}</dt><dd className="sk-num">{n(s.paragraphs)}</dd>
      <dt>{t('Sentences')}</dt><dd className="sk-num">{n(s.sentences)}</dd>
      <dt>{t('Average sentence')}</dt><dd className="sk-num">{n(s.avgSentence, 1)} {t('words')}</dd>
      <dt>{t('Longest sentence')}</dt><dd className="sk-num">{n(s.longestSentence)} {t('words')}</dd>
      <dt>{t('Dialogue')}</dt><dd className="sk-num">{n(s.dialogueShare * 100)} %</dd>
    </dl>
  )
}

export default function ReviewPanel() {
  const book = useStore(s => s.book)!
  const sceneId = useStore(s => s.sceneId)
  const { scene, chapter, label } = findScene(book, sceneId)!
  const sceneStats = useMemo(() => textStats(scene.text), [scene.text])
  const chapterStats = useMemo(() => textStats(chapter.scenes.map(s => s.text).join('\n')), [chapter.scenes])
  const t = useT()
  const bookStats = useMemo(() => textStats(book.chapters.flatMap(c => c.scenes.map(s => s.text)).join('\n')), [book.chapters])
  return (
    <aside className="pl-context">
      <p className="sk-hint">{t('Review: spellcheck is on and you can fix the text. Echo words, rhythm, voice and continuity checks arrive in 0.7.0.')}</p>
      <section><span className="sk-label">{t('This scene')}</span><Rows s={sceneStats} /></section>
      <section><span className="sk-label">{label}</span><Rows s={chapterStats} /></section>
      <section><span className="sk-label">{t('The whole book')}</span><Rows s={bookStats} /></section>
    </aside>
  )
}
