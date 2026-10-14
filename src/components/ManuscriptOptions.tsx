// How the manuscript looks: in the "Aa" panel (the quick part) and in
// Settings → Manuscript (all of it). Changes show on the page at once.
import { SettingRow, Switch } from '../studio-kit/shell.js'
import { DEFAULT_PREFS, useStore, type FontId, type PageSize, type Paper } from '../store'
import { FONTS, PAGE_SIZES } from '../lib/fonts'
import { useT } from '../i18n'

const PAPERS: [Paper, string][] = [['auto', 'Auto'], ['ivory', 'Ivory'], ['sepia', 'Sepia'], ['night', 'Night']]

function Slider({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <input type="range" className="sk-slider" min={min} max={max} step={step} value={value}
      style={{ ['--sk-fill' as string]: `${((value - min) / (max - min)) * 100}%` }} onChange={e => onChange(Number(e.target.value))} />
  )
}

export default function ManuscriptOptions({ full = false }: { full?: boolean }) {
  const prefs = useStore(s => s.prefs)
  const set = useStore(s => s.setPrefs)
  const t = useT()

  return (
    <>
      <SettingRow label={t('Font')}>
        <select className="sk-select" value={prefs.font} onChange={e => set({ font: e.target.value as FontId })}>
          {FONTS.map(f => <option key={f.id} value={f.id}>{t(f.label)}</option>)}
        </select>
      </SettingRow>
      <SettingRow label={t('Size')} description={`${prefs.size} px`}>
        <Slider value={prefs.size} min={14} max={26} step={1} onChange={v => set({ size: v })} />
      </SettingRow>
      <SettingRow label={t('Line spacing')} description={prefs.leading.toFixed(2)}>
        <Slider value={prefs.leading} min={1.3} max={2.2} step={0.05} onChange={v => set({ leading: v })} />
      </SettingRow>
      <SettingRow label={t('Justify the Sheet')} description={t('Page view is always justified, like a printed book')}>
        <Switch checked={prefs.justify} onChange={v => set({ justify: v })} label={t('Justify the Sheet')} />
      </SettingRow>
      <SettingRow label={t('Paper')}>
        <div className="sk-segmented" role="group" aria-label={t('Paper')}>
          {PAPERS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={prefs.paper === id || (id === 'auto' && prefs.paper === 'white')} onClick={() => set({ paper: id })}>{t(label)}</button>
          ))}
        </div>
      </SettingRow>

      <div className="pl-opt-group">{t('Above the text')}</div>
      <SettingRow label={t('Scene title')}>
        <Switch checked={prefs.showSceneTitle} onChange={v => set({ showSceneTitle: v })} label={t('Scene title')} />
      </SettingRow>
      <SettingRow label={t('Point of view')}>
        <Switch checked={prefs.showPov} onChange={v => set({ showPov: v })} label={t('Point of view')} />
      </SettingRow>
      <SettingRow label={t('Status (draft, revised, done)')}>
        <Switch checked={prefs.showStatus} onChange={v => set({ showStatus: v })} label={t('Status (draft, revised, done)')} />
      </SettingRow>

      <div className="pl-opt-group">{t('Page view')}</div>
      <SettingRow label={t('Page numbers')} description={t('Not on a chapter’s opening page, as in printed books')}>
        <Switch checked={prefs.pageNumbers} onChange={v => set({ pageNumbers: v })} label={t('Page numbers')} />
      </SettingRow>

      {full && (
        <>
          <div className="pl-opt-group">{t('Sizes')}</div>
          <SettingRow label={t('Sheet width')} description={`${prefs.width} rem`}>
            <Slider value={prefs.width} min={30} max={64} step={1} onChange={v => set({ width: v })} />
          </SettingRow>
          <SettingRow label={t('Page size')} description={t('Used by Page view')}>
            <select className="sk-select" value={prefs.pageSize} onChange={e => set({ pageSize: e.target.value as PageSize })}>
              <option value="auto">{t("From the book's language")}</option>
              {PAGE_SIZES.map(p => <option key={p.id} value={p.id}>{t(p.label)}</option>)}
            </select>
          </SettingRow>
          <SettingRow label={t('Page zoom')} description={`${Math.round(prefs.pageZoom * 100)} %`}>
            <Slider value={prefs.pageZoom} min={0.8} max={2} step={0.05} onChange={v => set({ pageZoom: v })} />
          </SettingRow>
          <div className="pl-row pl-end">
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm"
              onClick={() => set({ ...DEFAULT_PREFS, mode: prefs.mode, page: prefs.page, ui: prefs.ui, pinLeft: prefs.pinLeft, pinRight: prefs.pinRight, paneL: prefs.paneL, paneR: prefs.paneR, focus: prefs.focus, enterBreaks: prefs.enterBreaks })}>
              {t('Reset the manuscript look')}
            </button>
          </div>
        </>
      )}
    </>
  )
}
