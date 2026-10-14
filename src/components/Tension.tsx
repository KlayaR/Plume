// The tension curve (Plan → Structure): how tense each scene is, 0 to 10, drawn
// across the book with the structure template's beats as dashed lines. Claude
// rates the scenes from their notes and text; click the chart to correct one.
import { useState } from 'react'
import { ask as askDialog } from '@tauri-apps/plugin-dialog'
import { Sparkles } from 'lucide-react'
import { useStore } from '../store'
import { beatFlags, scenePositions } from '../lib/structures'
import { ask, parseJSON } from '../ai'
import { useT } from '../i18n'

const W = 720, H = 150, PAD = 26

export default function Tension() {
  const book = useStore(s => s.book)!
  const t = useT()
  const [busy, setBusy] = useState(false)
  const lang = book.meta.language
  const scenes = book.chapters.flatMap(c => c.scenes)
  const pos = scenePositions(book)
  if (!scenes.length) return null
  const rated = scenes.filter(s => s.tension !== undefined)
  const x = (s: typeof scenes[number]) => PAD + ((pos.get(s.id)!.start + pos.get(s.id)!.end) / 2 / 100) * (W - PAD - 8)
  const y = (v: number) => H - 14 - (v / 10) * (H - 28)

  const rate = async () => {
    if (rated.length && !(await askDialog(t('Rate every scene again? Values you set by hand will be replaced.'), { title: t('Tension'), kind: 'warning' }))) return
    setBusy(true)
    try {
      for (let from = 0; from < scenes.length; from += 40) {
        const part = scenes.slice(from, from + 40)
        const list = part.map((s, i) => `${i + 1}. ${s.title} : ${(s.summary || s.note || s.text.slice(0, 500)).replace(/\s+/g, ' ').trim()}`).join('\n')
        const reply = await ask({
          model: 'sonnet', effort: 'low',
          system: lang === 'fr' ? 'Tu es éditeur de romans de fantasy. Réponds uniquement en JSON valide.' : 'You are a fantasy fiction editor. Reply with valid JSON only.',
          message: `<scenes>\n${list}\n</scenes>\n\n${lang === 'fr'
            ? 'Note chaque scène de 0 à 10 selon sa tension dramatique (enjeux, danger, conflit, incertitude) : 0 = calme total, 5 = tension soutenue, 10 = point culminant. Utilise toute l’échelle.'
            : 'Rate each scene from 0 to 10 for dramatic tension (stakes, danger, conflict, uncertainty): 0 = total calm, 5 = sustained tension, 10 = the climax. Use the whole scale.'}\nJSON: [{"n": 1, "tension": 4}]`,
        })
        const out = parseJSON<{ n: number; tension: number }[]>(reply)
        if (!out) throw new Error(t('Claude’s reply could not be read. Try again.'))
        for (const o of out) {
          const s = part[Number(o.n) - 1]
          if (s && Number.isFinite(Number(o.tension))) useStore.getState().updateScene(s.id, { tension: Math.max(0, Math.min(10, Math.round(Number(o.tension)))) })
        }
      }
    } catch (e) { useStore.getState().notify('error', (e as Error).message) }
    setBusy(false)
  }

  /** A click on the chart sets the tension of the scene nearest to it. */
  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    const py = ((e.clientY - box.top) / box.height) * H
    const near = scenes.reduce((a, b) => Math.abs(x(b) - px) < Math.abs(x(a) - px) ? b : a)
    useStore.getState().updateScene(near.id, { tension: Math.max(0, Math.min(10, Math.round(((H - 14 - py) / (H - 28)) * 10))) })
  }

  const points = rated.map(s => `${x(s)},${y(s.tension!)}`).join(' ')
  const beats = book.meta.structure.beats

  return (
    <div className="pl-tension">
      <div className="pl-row">
        <span className="sk-label pl-grow">{t('Tension')}</span>
        <button type="button" className="sk-btn sk-btn-sm" disabled={busy} onClick={rate}><Sparkles size={13} /> {busy ? t('Thinking…') : t('Rate the scenes')}</button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="pl-tension-chart" role="img" aria-label={t('Tension')} onClick={click}>
        {[0, 5, 10].map(v => <g key={v}><line x1={PAD} x2={W - 4} y1={y(v)} y2={y(v)} className="pl-dash-grid" /><text x={PAD - 5} y={y(v) + 3} textAnchor="end" className="pl-dash-axis">{v}</text></g>)}
        {beats.map((b, i) => <g key={i}><line x1={PAD + (b.at / 100) * (W - PAD - 8)} x2={PAD + (b.at / 100) * (W - PAD - 8)} y1={6} y2={H - 14} className="pl-tension-beat" /><title>{b.name}</title></g>)}
        {rated.length > 1 && <polyline points={points} className="pl-tension-line" />}
        {rated.map(s => <circle key={s.id} cx={x(s)} cy={y(s.tension!)} r={4} className="pl-tension-dot"><title>{`${s.title} : ${s.tension}`}</title></circle>)}
      </svg>
      {beatFlags(book).map(f => (
        <button key={f.beat} type="button" className="pl-aicheck-row pl-warn" onClick={() => useStore.getState().selectScene(f.sceneId)}>
          {f.kind === 'calm'
            ? t('“{beat}” usually peaks, but its scene “{scene}” is rated {n}.', { beat: f.beat, scene: f.sceneTitle, n: f.tension })
            : t('“{beat}” usually breathes, but its scene “{scene}” is rated {n}.', { beat: f.beat, scene: f.sceneTitle, n: f.tension })}
        </button>
      ))}
      <span className="sk-hint">{rated.length ? t('Click the chart to correct a scene’s value. Dashed lines: the beats of your structure.') : t('Claude rates each scene from its note or text; then you can correct any value by clicking the chart.')}</span>
    </div>
  )
}
